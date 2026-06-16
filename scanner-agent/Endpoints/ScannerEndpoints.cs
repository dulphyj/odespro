using System.Text.Json;
using ScannerAgent.Models;
using ScannerAgent.Services;

namespace ScannerAgent.Endpoints;

public static class ScannerEndpoints
{
    public static WebApplication MapScannerEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/scanners", async (ScannerDiscoveryService discovery) =>
        {
            var scanners = await discovery.DiscoverScannersAsync();
            return Results.Ok(scanners);
        });

        api.MapGet("/scanners/default", async (ScannerDiscoveryService discovery) =>
        {
            var scanner = await discovery.GetDefaultScannerAsync();
            return scanner is not null
                ? Results.Ok(scanner)
                : Results.NotFound(new { message = "No scanner found" });
        });

        api.MapPost("/scanners/test", async (TestScannerRequest request, ScannerDiscoveryService discovery) =>
        {
            if (string.IsNullOrWhiteSpace(request.ScannerId))
                return Results.BadRequest(new { message = "ScannerId is required" });

            var isAvailable = await discovery.TestScannerAsync(request.ScannerId);
            return Results.Ok(new { scannerId = request.ScannerId, isAvailable });
        });

        api.MapPost("/scan", async (ScanRequest request, ScannerService scannerService) =>
        {
            if (string.IsNullOrWhiteSpace(request.ScannerId))
                return Results.BadRequest(new { message = "ScannerId is required" });

            if (request.Dpi is < 50 or > 1200)
                return Results.BadRequest(new { message = "Dpi must be between 50 and 1200" });

            if (request.CompressionLevel is < 1 or > 100)
                return Results.BadRequest(new { message = "CompressionLevel must be between 1 and 100" });

            var result = scannerService.StartScan(request);
            return Results.Accepted($"/api/scan/{result.JobId}", new
            {
                jobId = result.JobId,
                status = result.Status,
                statusUrl = $"/api/scan/{result.JobId}"
            });
        });

        api.MapGet("/scan/{jobId:guid}", (Guid jobId, ScannerService scannerService) =>
        {
            var result = scannerService.GetScanStatus(jobId);
            return result is not null
                ? Results.Ok(result)
                : Results.NotFound(new { message = "Scan job not found" });
        });

        api.MapPost("/scan/pdf", async (ScanRequest request, ScannerService scannerService) =>
        {
            request.FileFormat = "Pdf";
            if (string.IsNullOrWhiteSpace(request.ScannerId))
                return Results.BadRequest(new { message = "ScannerId is required" });

            var result = scannerService.StartScan(request);

            if (result.JobId == Guid.Empty)
                return Results.BadRequest(new { message = "Failed to start scan job" });

            return Results.Accepted($"/api/scan/{result.JobId}", new
            {
                jobId = result.JobId,
                status = result.Status,
                statusUrl = $"/api/scan/{result.JobId}"
            });
        });

        api.MapPost("/scan/images", async (ScanRequest request, ScannerService scannerService) =>
        {
            request.FileFormat = "Jpeg";
            if (string.IsNullOrWhiteSpace(request.ScannerId))
                return Results.BadRequest(new { message = "ScannerId is required" });

            var result = scannerService.StartScan(request);

            if (result.JobId == Guid.Empty)
                return Results.BadRequest(new { message = "Failed to start scan job" });

            return Results.Accepted($"/api/scan/{result.JobId}", new
            {
                jobId = result.JobId,
                status = result.Status,
                statusUrl = $"/api/scan/{result.JobId}"
            });
        });

        api.MapPost("/scan/upload", async (ScanRequest request, ScannerService scannerService,
            IConfiguration config) =>
        {
            var result = scannerService.StartScan(request);

            if (result.JobId == Guid.Empty)
                return Results.BadRequest(new { message = "Failed to start scan job" });

            try
            {
                await WaitForJobCompletion(result.JobId, scannerService, TimeSpan.FromSeconds(60));

                var jobResult = scannerService.GetScanStatus(result.JobId);
                if (jobResult?.Status != "Completed")
                {
                    return Results.Ok(new
                    {
                        jobId = result.JobId,
                        status = jobResult?.Status ?? "Unknown",
                        message = "Scan did not complete successfully"
                    });
                }

                var backendUrl = config.GetValue<string>("BackendUrl") ?? "http://backend:8000";
                var httpClientFactory = app.Services.GetRequiredService<IHttpClientFactory>();
                var httpClient = httpClientFactory.CreateClient("BackendClient");

                if (!string.IsNullOrEmpty(jobResult.PdfPath) && File.Exists(jobResult.PdfPath))
                {
                    var pdfBytes = await File.ReadAllBytesAsync(jobResult.PdfPath);
                    using var formData = new MultipartFormDataContent();
                    formData.Add(new ByteArrayContent(pdfBytes), "file", $"{result.JobId}.pdf");
                    formData.Add(new StringContent(result.JobId.ToString()), "jobId");

                    var uploadResponse = await httpClient.PostAsync(
                        $"{backendUrl}/api/documents/upload", formData);

                    if (uploadResponse.IsSuccessStatusCode)
                    {
                        return Results.Ok(new
                        {
                            jobId = result.JobId,
                            status = "Uploaded",
                            uploadStatus = (int)uploadResponse.StatusCode
                        });
                    }
                }

                return Results.Ok(new
                {
                    jobId = result.JobId,
                    status = "Completed",
                    message = "Scan completed but upload to backend failed"
                });
            }
            catch (TimeoutException)
            {
                return Results.Ok(new
                {
                    jobId = result.JobId,
                    status = "Timeout",
                    message = "Scan is taking longer than expected, check status later"
                });
            }
        });

        api.MapPost("/scan/cancel/{jobId:guid}", (Guid jobId, ScannerService scannerService) =>
        {
            var cancelled = scannerService.CancelScan(jobId);
            return cancelled
                ? Results.Ok(new { jobId, status = "Cancelled" })
                : Results.NotFound(new { message = "Scan job not found or already completed" });
        });

        api.MapGet("/status", (ScannerStatusService statusService) =>
        {
            return Results.Ok(statusService.GetStatus());
        });

        api.MapGet("/status/health", () =>
        {
            return Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
        });

        return app;
    }

    private static async Task WaitForJobCompletion(Guid jobId, ScannerService scannerService, TimeSpan timeout)
    {
        var startTime = DateTime.UtcNow;
        var terminalStates = new[] { "Completed", "Failed", "Cancelled" };

        while (DateTime.UtcNow - startTime < timeout)
        {
            var result = scannerService.GetScanStatus(jobId);
            if (result != null && terminalStates.Contains(result.Status))
            {
                return;
            }
            await Task.Delay(500);
        }

        throw new TimeoutException($"Scan job {jobId} did not complete within {timeout.TotalSeconds} seconds");
    }
}

public record TestScannerRequest(string ScannerId);

public class ScannerStatusService
{
    private readonly ScannerDiscoveryService _discovery;
    private readonly ScanJobService _jobService;
    private readonly DateTime _startTime = DateTime.UtcNow;

    public ScannerStatusService(ScannerDiscoveryService discovery, ScanJobService jobService)
    {
        _discovery = discovery;
        _jobService = jobService;
    }

    public ScannerStatus GetStatus()
    {
        return new ScannerStatus
        {
            IsOnline = true,
            IsScannerConnected = _discovery.CachedScanners.Count > 0,
            ActiveJobs = _jobService.ActiveJobCount,
            Uptime = DateTime.UtcNow - _startTime,
            Version = "1.0.0",
            LastScanTime = DateTime.UtcNow
        };
    }
}
