using ScannerAgent.Models;

namespace ScannerAgent.Services;

public class ScannerService
{
    private readonly IScannerProvider _scannerProvider;
    private readonly ScanJobService _jobService;
    private readonly ImageService _imageService;
    private readonly PdfService _pdfService;
    private readonly OcrBridgeService _ocrBridgeService;
    private readonly ILogger<ScannerService> _logger;
    private readonly IConfiguration _configuration;

    private readonly IHttpClientFactory? _httpClientFactory;

    public ScannerService(
        IScannerProvider scannerProvider,
        ScanJobService jobService,
        ImageService imageService,
        PdfService pdfService,
        OcrBridgeService ocrBridgeService,
        ILogger<ScannerService> logger,
        IConfiguration configuration,
        IHttpClientFactory? httpClientFactory = null)
    {
        _scannerProvider = scannerProvider;
        _jobService = jobService;
        _imageService = imageService;
        _pdfService = pdfService;
        _ocrBridgeService = ocrBridgeService;
        _logger = logger;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
    }

    public ScanResult StartScan(ScanRequest request)
    {
        var job = _jobService.CreateJob(request);
        job.Status = "Scanning";
        _jobService.UpdateJobStatus(job.Id, "Scanning");

        _ = Task.Run(async () =>
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                job.CancellationTokenSource = cts;

                var scanResult = await _scannerProvider.ScanAsync(request, cts.Token);

                if (scanResult.Status == "Cancelled")
                {
                    _jobService.UpdateJobStatus(job.Id, "Cancelled");
                    return;
                }

                if (scanResult.Status == "Failed")
                {
                    _jobService.UpdateJobResult(job.Id, r =>
                    {
                        r.Status = "Failed";
                        r.Errors = scanResult.Errors;
                    });
                    _jobService.UpdateJobStatus(job.Id, "Failed");
                    return;
                }

                _jobService.UpdateJobResult(job.Id, r =>
                {
                    r.Pages = scanResult.Pages;
                    r.TotalPages = scanResult.TotalPages;
                    r.ImagePaths = scanResult.ImagePaths;
                });

                _jobService.UpdateJobStatus(job.Id, "Processing");

                await ProcessScannedImagesAsync(job.Id);

                var jobResult = _jobService.GetJobResult(job.Id);
                if (jobResult == null) return;

                if (request.FileFormat.Equals("Pdf", StringComparison.OrdinalIgnoreCase))
                {
                    var tempFolder = _configuration.GetValue<string>("ScanSettings:TempFolder")
                                     ?? Path.Combine(Path.GetTempPath(), "scanner-agent");

                    var pdfDir = Path.Combine(tempFolder, "pdfs");
                    Directory.CreateDirectory(pdfDir);
                    var pdfPath = Path.Combine(pdfDir, $"{job.Id}.pdf");

                    var imagePaths = jobResult.Pages
                        .OrderBy(p => p.PageNumber)
                        .Select(p => p.ImagePath)
                        .Where(File.Exists)
                        .ToList();

                    if (imagePaths.Count > 0)
                    {
                        var generatedPath = await _pdfService.GeneratePdfFromImagesAsync(
                            imagePaths, pdfPath, request.CompressionLevel);

                        var fileInfo = new FileInfo(generatedPath);

                        _jobService.UpdateJobResult(job.Id, r =>
                        {
                            r.PdfPath = generatedPath;
                            r.FileSize = fileInfo.Length;
                            r.FileFormat = "Pdf";
                        });

                        if (_ocrBridgeService.IsEnabled)
                        {
                            try
                            {
                                await _ocrBridgeService.SendPdfToOcrService(generatedPath);
                                _jobService.UpdateJobResult(job.Id, r =>
                                {
                                    r.Pages.ForEach(p => p.HasOcr = true);
                                });
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "OCR processing failed for job {JobId}", job.Id);
                            }
                        }
                    }
                }

                // Auto-upload to backend if BackendUrl is configured
                var backendUrl = _configuration.GetValue<string>("BackendUrl");
                if (!string.IsNullOrEmpty(backendUrl) && _httpClientFactory != null)
                {
                    try
                    {
                        var uploadJobResult = _jobService.GetJobResult(job.Id);
                        if (uploadJobResult?.PdfPath != null && File.Exists(uploadJobResult.PdfPath))
                        {
                            var pdfBytes = await File.ReadAllBytesAsync(uploadJobResult.PdfPath);
                            using var formData = new MultipartFormDataContent();
                            var fileContent = new ByteArrayContent(pdfBytes);
                            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                            formData.Add(fileContent, "file", $"scan_{job.Id}.pdf");
                            formData.Add(new StringContent($"Scan_{job.Id:N}"), "title");

                            var httpClient = _httpClientFactory.CreateClient("BackendClient");
                            var uploadResponse = await httpClient.PostAsync(
                                $"{backendUrl}/api/documents/upload", formData);

                            if (uploadResponse.IsSuccessStatusCode)
                            {
                                var docJson = await uploadResponse.Content.ReadAsStringAsync();
                                _jobService.UpdateJobResult(job.Id, r =>
                                {
                                    r.BackendDocumentId = docJson;
                                });
                                _logger.LogInformation("Scan job {JobId} uploaded to backend", job.Id);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to auto-upload scan result for job {JobId}", job.Id);
                    }
                }

                _jobService.UpdateJobStatus(job.Id, "Completed");
                _logger.LogInformation("Scan job {JobId} completed successfully", job.Id);
            }
            catch (OperationCanceledException)
            {
                _jobService.UpdateJobStatus(job.Id, "Cancelled");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scan job {JobId} failed", job.Id);
                _jobService.UpdateJobResult(job.Id, r =>
                {
                    r.Errors.Add(ex.Message);
                });
                _jobService.UpdateJobStatus(job.Id, "Failed");
            }
        });

        return job.Result;
    }

    public ScanResult? GetScanStatus(Guid jobId)
    {
        return _jobService.GetJobResult(jobId);
    }

    public bool CancelScan(Guid jobId)
    {
        var job = _jobService.GetJob(jobId);
        if (job == null) return false;

        if (job.Status is "Created" or "Scanning" or "Processing")
        {
            job.CancellationTokenSource?.Cancel();
            _jobService.UpdateJobStatus(jobId, "Cancelled");
            _logger.LogInformation("Scan job {JobId} cancelled", jobId);
            return true;
        }

        return false;
    }

    private async Task ProcessScannedImagesAsync(Guid jobId)
    {
        var job = _jobService.GetJob(jobId);
        if (job?.Result?.Pages == null) return;

        var pages = job.Result.Pages;
        var options = new ImageProcessingOptions
        {
            Deskew = true,
            AutoCrop = true,
            Brightness = 0,
            Contrast = 0,
            Quality = 90
        };

        var processedCount = 0;
        var emptyPages = new List<int>();

        foreach (var page in pages)
        {
            try
            {
                if (!File.Exists(page.ImagePath)) continue;

                var tempPath = page.ImagePath + ".tmp";

                await _imageService.ProcessImageAsync(page.ImagePath, tempPath, options);

                if (File.Exists(tempPath))
                {
                    File.Delete(page.ImagePath);
                    File.Move(tempPath, page.ImagePath);
                }

                var isEmpty = await _imageService.DetectEmptyPageAsync(page.ImagePath);
                if (isEmpty)
                {
                    emptyPages.Add(page.PageNumber);
                }

                processedCount++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to process page {Page} for job {JobId}",
                    page.PageNumber, jobId);
            }
        }

        if (emptyPages.Count > 0)
        {
            _logger.LogInformation("Detected {Count} empty pages in job {JobId}: {Pages}",
                emptyPages.Count, jobId, string.Join(", ", emptyPages));
        }

        _logger.LogDebug("Processed {Count}/{Total} images for job {JobId}",
            processedCount, pages.Count, jobId);
    }
}
