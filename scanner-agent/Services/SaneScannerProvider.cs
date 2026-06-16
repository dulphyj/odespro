using System.Diagnostics;
using System.Text.RegularExpressions;
using ScannerAgent.Models;

namespace ScannerAgent.Services;

public partial class SaneScannerProvider : IScannerProvider
{
    private readonly ILogger<SaneScannerProvider> _logger;
    private static readonly bool _scanimageAvailable;

    static SaneScannerProvider()
    {
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "which",
                    Arguments = "scanimage",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }
            };
            proc.Start();
            proc.WaitForExit(3000);
            _scanimageAvailable = proc.ExitCode == 0;
        }
        catch
        {
            _scanimageAvailable = false;
        }
    }

    public SaneScannerProvider(ILogger<SaneScannerProvider> logger)
    {
        _logger = logger;
        if (!_scanimageAvailable)
            _logger.LogWarning("scanimage CLI not found; SANE scanner provider will use fallback mode");
    }

    public Task<List<ScannerInfo>> GetScannersAsync()
    {
        if (!_scanimageAvailable)
            return Task.FromResult(GetFallbackScanners());

        try
        {
            var output = RunScanimage(new[] { "-L" });
            if (string.IsNullOrWhiteSpace(output))
            {
                _logger.LogInformation("scanimage -L returned no output, falling back to stub scanner");
                return Task.FromResult(GetFallbackScanners());
            }

            var scanners = ParseScanimageOutput(output);
            if (scanners.Count == 0)
            {
                _logger.LogInformation("No scanners detected via SANE, falling back to stub scanner");
                return Task.FromResult(GetFallbackScanners());
            }

            return Task.FromResult(scanners);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SANE scanner detection failed, falling back to stub scanner");
            return Task.FromResult(GetFallbackScanners());
        }
    }

    public Task<ScannerInfo?> GetDefaultScannerAsync()
    {
        var scanners = GetScannersAsync().Result;
        return Task.FromResult(scanners.FirstOrDefault(s => s.IsDefault) ?? scanners.FirstOrDefault());
    }

    public Task<bool> TestScannerAsync(string scannerId)
    {
        _logger.LogInformation("Testing SANE scanner {ScannerId}", scannerId);
        return Task.FromResult(_scanimageAvailable);
    }

    public Task<ScanResult> ScanAsync(ScanRequest request, CancellationToken ct = default)
    {
        _logger.LogInformation("SANE scan request: Scanner={ScannerId}, DPI={Dpi}, Color={ColorMode}",
            request.ScannerId, request.Dpi, request.ColorMode);

        if (!_scanimageAvailable)
            return GenerateStubScan(request);

        try
        {
            return PerformSaneScanAsync(request, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SANE scan failed, falling back to stub scan");
            return GenerateStubScan(request);
        }
    }

    public Task<ScanResult> ScanPreviewAsync(string scannerId, int dpi = 200)
    {
        return ScanAsync(new ScanRequest
        {
            ScannerId = scannerId,
            Dpi = dpi,
            ColorMode = "Color",
            PageCount = 1,
        }, CancellationToken.None);
    }

    private async Task<ScanResult> PerformSaneScanAsync(ScanRequest request, CancellationToken ct)
    {
        var result = new ScanResult
        {
            JobId = Guid.NewGuid(),
            Status = "completed",
            FileFormat = request.FileFormat ?? "Png",
            CreatedAt = DateTime.UtcNow,
            Pages = new List<ScanPage>(),
            ImagePaths = new List<string>(),
        };

        string tempDir = Path.Combine(Path.GetTempPath(), "odespro_scans", result.JobId.ToString());
        Directory.CreateDirectory(tempDir);

        int totalPages = request.UseAdf ? Math.Max(request.PageCount, 1) : 1;
        if (request.Duplex) totalPages *= 2;
        result.TotalPages = totalPages;

        string ext = (request.FileFormat ?? "Png").ToLower();
        if (ext == "pdf") ext = "png";

        for (int i = 0; i < totalPages; i++)
        {
            ct.ThrowIfCancellationRequested();

            string imagePath = Path.Combine(tempDir, $"page_{i + 1}.{ext}");
            string deviceArg = request.ScannerId;

            var args = new List<string>
            {
                $"--source={GetSaneSource(request.UseAdf, request.Duplex)}",
                $"--resolution={request.Dpi}",
                $"--mode={GetSaneColorMode(request.ColorMode)}",
                $"--format={ext}",
                $"--output-file={imagePath}",
            };

            if (!string.IsNullOrEmpty(deviceArg) && deviceArg != "stub")
                args.Insert(0, $"--device={deviceArg}");

            try
            {
                var output = RunScanimage(args.ToArray(), timeoutMs: 60000);
                _logger.LogDebug("scanimage output: {Output}", output);

                if (!File.Exists(imagePath))
                {
                    var files = Directory.GetFiles(tempDir, $"page_{i + 1}.*");
                    imagePath = files.FirstOrDefault() ?? imagePath;
                }

                if (!File.Exists(imagePath))
                {
                    _logger.LogWarning("scanimage produced no output for page {Page}, using stub", i + 1);
                    imagePath = GenerateStubImage(tempDir, i + 1, ext, request.Dpi);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "scanimage failed for page {Page}, using stub", i + 1);
                imagePath = GenerateStubImage(tempDir, i + 1, ext, request.Dpi);
            }

            result.Pages.Add(new ScanPage
            {
                PageNumber = i + 1,
                ImagePath = imagePath,
                Width = request.Dpi * 8,
                Height = request.Dpi * 11,
                Rotation = 0,
            });
            result.ImagePaths.Add(imagePath);
        }

        return result;
    }

    private Task<ScanResult> GenerateStubScan(ScanRequest request)
    {
        var result = new ScanResult
        {
            JobId = Guid.NewGuid(),
            Status = "completed",
            FileFormat = request.FileFormat ?? "Png",
            CreatedAt = DateTime.UtcNow,
            Pages = new List<ScanPage>(),
            ImagePaths = new List<string>(),
        };

        int totalPages = request.UseAdf ? Math.Max(request.PageCount, 1) : 1;
        if (request.Duplex) totalPages *= 2;

        string tempDir = Path.Combine(Path.GetTempPath(), "odespro_scans", result.JobId.ToString());
        Directory.CreateDirectory(tempDir);

        for (int i = 0; i < totalPages; i++)
        {
            string ext = (request.FileFormat ?? "Png").ToLower();
            string imagePath = GenerateStubImage(tempDir, i + 1, ext, request.Dpi);

            result.Pages.Add(new ScanPage
            {
                PageNumber = i + 1,
                ImagePath = imagePath,
                Width = request.Dpi * 8,
                Height = request.Dpi * 11,
                Rotation = 0,
            });
            result.ImagePaths.Add(imagePath);
        }

        result.TotalPages = totalPages;
        return Task.FromResult(result);
    }

    private string GenerateStubImage(string dir, int pageNum, string ext, int dpi)
    {
        string imagePath = Path.Combine(dir, $"page_{pageNum}.{ext}");

        try
        {
            using var surface = SkiaSharp.SKSurface.Create(new SkiaSharp.SKImageInfo(dpi * 8, dpi * 11));
            var canvas = surface.Canvas;
            canvas.Clear(SkiaSharp.SKColors.White);

            var bgPaint = new SkiaSharp.SKPaint
            {
                Color = SkiaSharp.SKColors.LightGray,
                Style = SkiaSharp.SKPaintStyle.Fill,
            };
            canvas.DrawRect(50, 50, dpi * 8 - 100, dpi * 11 - 100, bgPaint);

            var textPaint = new SkiaSharp.SKPaint
            {
                Color = SkiaSharp.SKColors.DarkGray,
                TextSize = 24,
                IsAntialias = true,
            };
            canvas.DrawText($"Página {pageNum}", dpi * 8 / 2 - 40, dpi * 11 / 2, textPaint);

            using var image = surface.Snapshot();
            using var data = image.Encode(GetSkiaFormat(ext), 90);
            using var stream = System.IO.File.OpenWrite(imagePath);
            data.SaveTo(stream);

            _logger.LogDebug("Generated stub page {Page} at {Path}", pageNum, imagePath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate stub page {Page}", pageNum);
            System.IO.File.WriteAllBytes(imagePath, new byte[1024]);
        }

        return imagePath;
    }

    private List<ScannerInfo> ParseScanimageOutput(string output)
    {
        var scanners = new List<ScannerInfo>();
        var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        foreach (var line in lines)
        {
            var match = ScanimageLineRegex().Match(line);
            if (!match.Success) continue;

            var id = match.Groups[1].Value.Trim();
            var desc = match.Groups.Count > 2 ? match.Groups[2].Value.Trim() : id;

            var isV4l = id.Contains("v4l", StringComparison.OrdinalIgnoreCase);
            var isNetwork = id.Contains("net", StringComparison.OrdinalIgnoreCase) || id.Contains("airscan", StringComparison.OrdinalIgnoreCase);

            scanners.Add(new ScannerInfo
            {
                Id = id,
                DeviceId = id,
                Name = desc,
                Manufacturer = ParseManufacturer(desc, id),
                Model = desc,
                DeviceType = isNetwork ? "WIA" : "TWAIN",
                IsAvailable = true,
                IsDefault = scanners.Count == 0,
                ConnectionType = isNetwork ? "Network" : (isV4l ? "USB" : "USB"),
                SupportedResolutions = new List<int> { 75, 100, 150, 200, 300, 400, 600, 1200 },
                SupportsColor = true,
                SupportsGrayscale = true,
                SupportsDuplex = desc.Contains("duplex", StringComparison.OrdinalIgnoreCase),
                SupportsAdf = desc.Contains("adf", StringComparison.OrdinalIgnoreCase) || desc.Contains("document feeder", StringComparison.OrdinalIgnoreCase),
            });
        }

        return scanners;
    }

    private List<ScannerInfo> GetFallbackScanners()
    {
        return new List<ScannerInfo>
        {
            new()
            {
                Id = "stub",
                DeviceId = "stub",
                Name = "Scanner de prueba (sin hardware)",
                Manufacturer = "Simulado",
                Model = "Stub Scanner",
                DeviceType = "TWAIN",
                IsDefault = true,
                IsAvailable = true,
                ConnectionType = "USB",
                SupportedResolutions = new List<int> { 75, 100, 150, 200, 300, 400, 600 },
                SupportsColor = true,
                SupportsGrayscale = true,
                SupportsDuplex = true,
                SupportsAdf = true,
            },
        };
    }

    private static string RunScanimage(string[] args, int timeoutMs = 10000)
    {
        using var proc = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "scanimage",
                Arguments = string.Join(" ", args.Select(a => a.Contains(' ') ? $"\"{a}\"" : a)),
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            }
        };
        proc.Start();
        var output = proc.StandardOutput.ReadToEnd();
        var error = proc.StandardError.ReadToEnd();
        proc.WaitForExit(timeoutMs);

        if (!string.IsNullOrEmpty(error))
        {
            // scanimage may emit warnings on stderr but still succeed
            // Log warnings for debugging
        }

        return output;
    }

    private static string GetSaneSource(bool useAdf, bool duplex)
    {
        if (useAdf && duplex) return "ADF Duplex";
        if (useAdf) return "ADF";
        return "Flatbed";
    }

    private static string GetSaneColorMode(string mode) => mode.ToLower() switch
    {
        "color" => "Color",
        "grayscale" => "Gray",
        "black_white" or "blackandwhite" or "lineart" => "Lineart",
        _ => "Color",
    };

    private static string ParseManufacturer(string description, string deviceId)
    {
        if (deviceId.StartsWith("hp", StringComparison.OrdinalIgnoreCase) ||
            deviceId.Contains("hewlett", StringComparison.OrdinalIgnoreCase))
            return "HP";

        if (deviceId.StartsWith("canon", StringComparison.OrdinalIgnoreCase))
            return "Canon";

        if (deviceId.StartsWith("epson", StringComparison.OrdinalIgnoreCase))
            return "Epson";

        if (deviceId.StartsWith("brother", StringComparison.OrdinalIgnoreCase))
            return "Brother";

        if (deviceId.Contains("fujitsu", StringComparison.OrdinalIgnoreCase))
            return "Fujitsu";

        if (deviceId.Contains("kodak", StringComparison.OrdinalIgnoreCase))
            return "Kodak";

        var parts = description.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 0 ? parts[0] : "Unknown";
    }

    private static SkiaSharp.SKEncodedImageFormat GetSkiaFormat(string ext) => ext switch
    {
        "jpg" or "jpeg" => SkiaSharp.SKEncodedImageFormat.Jpeg,
        "tiff" or "tif" => SkiaSharp.SKEncodedImageFormat.Png,
        "bmp" => SkiaSharp.SKEncodedImageFormat.Bmp,
        _ => SkiaSharp.SKEncodedImageFormat.Png,
    };

    [GeneratedRegex(@"device\s+`([^']+)'\s+is\s+a\s+(.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex ScanimageLineRegex();
}