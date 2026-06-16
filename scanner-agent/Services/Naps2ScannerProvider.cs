using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using ScannerAgent.Models;

namespace ScannerAgent.Services;

public partial class Naps2ScannerProvider : IScannerProvider
{
    private readonly ILogger<Naps2ScannerProvider> _logger;
    private static readonly bool _isWindows;
    private static string? _naps2ExePath;

    static Naps2ScannerProvider()
    {
        _isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        if (_isWindows)
            _naps2ExePath = FindNaps2Executable();
    }

    public Naps2ScannerProvider(ILogger<Naps2ScannerProvider> logger)
    {
        _logger = logger;
        if (!_isWindows)
        {
            _logger.LogInformation("NAPS2 provider requires Windows; use SaneScannerProvider on Linux");
        }
        else if (_naps2ExePath == null)
        {
            _logger.LogWarning("NAPS2 CLI not found. Install NAPS2 from https://www.naps2.com or use the stub scanner.");
        }
        else
        {
            _logger.LogInformation("NAPS2 found at {Path}", _naps2ExePath);
        }
    }

    public Task<List<ScannerInfo>> GetScannersAsync()
    {
        if (!_isWindows)
            return Task.FromResult(new List<ScannerInfo>());

        try
        {
            var scanners = new List<ScannerInfo>();

            // Try NAPS2 first for detailed scanner info
            if (_naps2ExePath != null)
            {
                try
                {
                    var output = RunNaps2Process("--listdevices");
                    var parsed = ParseNaps2DeviceList(output);
                    if (parsed.Count > 0)
                    {
                        return Task.FromResult(parsed);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "NAPS2 --listdevices failed");
                }
            }

            // Fallback: WMI
            try
            {
                var wmiScanners = GetScannersFromWmi();
                if (wmiScanners.Count > 0)
                    return Task.FromResult(wmiScanners);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "WMI scanner detection failed");
            }

            _logger.LogWarning("No scanners detected via NAPS2 or WMI, returning empty list");
            return Task.FromResult(scanners);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error detecting scanners");
            return Task.FromResult(new List<ScannerInfo>());
        }
    }

    public Task<ScannerInfo?> GetDefaultScannerAsync()
    {
        var scanners = GetScannersAsync().Result;
        return Task.FromResult(scanners.FirstOrDefault(s => s.IsDefault) ?? scanners.FirstOrDefault());
    }

    public Task<bool> TestScannerAsync(string scannerId)
    {
        if (!_isWindows)
            return Task.FromResult(false);

        _logger.LogInformation("Testing scanner {ScannerId}", scannerId);

        if (_naps2ExePath != null)
        {
            try
            {
                var output = RunNaps2Process($"--test-device \"{scannerId}\"");
                return Task.FromResult(!string.IsNullOrWhiteSpace(output));
            }
            catch
            {
                return Task.FromResult(false);
            }
        }

        return Task.FromResult(true);
    }

    public Task<ScanResult> ScanAsync(ScanRequest request, CancellationToken ct = default)
    {
        _logger.LogInformation("NAPS2 scan request: Scanner={ScannerId}, DPI={Dpi}, Color={ColorMode}",
            request.ScannerId, request.Dpi, request.ColorMode);

        if (_naps2ExePath != null && _isWindows)
            return PerformNaps2ScanAsync(request, ct);

        _logger.LogWarning("NAPS2 not available, using stub scan");
        return GenerateStubScan(request);
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

    private async Task<ScanResult> PerformNaps2ScanAsync(ScanRequest request, CancellationToken ct)
    {
        var result = new ScanResult
        {
            JobId = Guid.NewGuid(),
            Status = "completed",
            FileFormat = request.FileFormat ?? "Pdf",
            CreatedAt = DateTime.UtcNow,
            Pages = new List<ScanPage>(),
            ImagePaths = new List<string>(),
        };

        string tempDir = Path.Combine(Path.GetTempPath(), "odespro_scans", result.JobId.ToString());
        Directory.CreateDirectory(tempDir);

        string outputPath;
        string ext;

        if (request.FileFormat.Equals("Pdf", StringComparison.OrdinalIgnoreCase))
        {
            outputPath = Path.Combine(tempDir, "scan.pdf");
            ext = "jpg";
        }
        else
        {
            ext = request.FileFormat.ToLower();
            outputPath = Path.Combine(tempDir, $"scan.{ext}");
        }

        var args = new List<string>
        {
            $"--output \"{outputPath}\"",
            $"--dpi {request.Dpi}",
            $"--mode {GetNaps2ColorMode(request.ColorMode)}",
        };

        if (!string.IsNullOrEmpty(request.ScannerId) && request.ScannerId != "stub")
            args.Add($"--device \"{request.ScannerId}\"");
        if (request.UseAdf)
            args.Add("--source ADF");
        if (request.Duplex)
            args.Add("--duplex");
        if (request.PageCount > 1)
            args.Add($"--count {request.PageCount}");

        try
        {
            var output = RunNaps2Process(string.Join(" ", args), ct, 120000);
            _logger.LogDebug("NAPS2 output: {Output}", output);

            if (request.FileFormat.Equals("Pdf", StringComparison.OrdinalIgnoreCase) && File.Exists(outputPath))
            {
                result.PdfPath = outputPath;
                result.ImagePaths.Add(outputPath);
                result.Pages.Add(new ScanPage
                {
                    PageNumber = 1,
                    ImagePath = outputPath,
                    Width = request.Dpi * 8,
                    Height = request.Dpi * 11,
                    Rotation = 0,
                });
                result.TotalPages = 1;
            }
            else if (File.Exists(outputPath))
            {
                result.ImagePaths.Add(outputPath);
                result.Pages.Add(new ScanPage
                {
                    PageNumber = 1,
                    ImagePath = outputPath,
                    Width = request.Dpi * 8,
                    Height = request.Dpi * 11,
                    Rotation = 0,
                });
                result.TotalPages = 1;
            }
            else
            {
                _logger.LogWarning("NAPS2 produced no output, using stub");
                return await GenerateStubScan(request);
            }
        }
        catch (OperationCanceledException)
        {
            result.Status = "Cancelled";
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NAPS2 scan failed, using stub");
            return await GenerateStubScan(request);
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
            string imagePath = Path.Combine(tempDir, $"page_{i + 1}.{ext}");

            try
            {
                using var surface = SkiaSharp.SKSurface.Create(new SkiaSharp.SKImageInfo(
                    request.Dpi * 8, request.Dpi * 11));
                var canvas = surface.Canvas;
                canvas.Clear(SkiaSharp.SKColors.White);

                var paint = new SkiaSharp.SKPaint
                {
                    Color = SkiaSharp.SKColors.LightGray,
                    Style = SkiaSharp.SKPaintStyle.Fill,
                };
                canvas.DrawRect(50, 50, request.Dpi * 8 - 100, request.Dpi * 11 - 100, paint);

                var textPaint = new SkiaSharp.SKPaint
                {
                    Color = SkiaSharp.SKColors.DarkGray,
                    TextSize = 24,
                    IsAntialias = true,
                };
                canvas.DrawText($"Página {i + 1}", request.Dpi * 8 / 2 - 40, request.Dpi * 11 / 2, textPaint);

                using var image = surface.Snapshot();
                using var data = image.Encode(GetSkiaFormat(ext), 90);
                using var stream = System.IO.File.OpenWrite(imagePath);
                data.SaveTo(stream);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to generate stub page {Page}", i + 1);
                System.IO.File.WriteAllBytes(imagePath, []);
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

        result.TotalPages = totalPages;
        return Task.FromResult(result);
    }

    private List<ScannerInfo> GetScannersFromWmi()
    {
        var scanners = new List<ScannerInfo>();

        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "wmic",
                    Arguments = "path Win32_Scanner get DeviceID,Name,Description /FORMAT:CSV",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }
            };
            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(5000);

            var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            for (int i = 1; i < lines.Length; i++)
            {
                var parts = lines[i].Trim().Split(',');
                if (parts.Length >= 3)
                {
                    var deviceId = parts[0].Trim();
                    var name = parts.Length > 2 ? parts[2].Trim() : deviceId;

                    scanners.Add(new ScannerInfo
                    {
                        Id = deviceId,
                        DeviceId = deviceId,
                        Name = name,
                        Manufacturer = "Unknown",
                        Model = name,
                        DeviceType = "WIA",
                        IsAvailable = true,
                        IsDefault = scanners.Count == 0,
                        ConnectionType = "USB",
                        SupportedResolutions = new List<int> { 100, 150, 200, 300, 400, 600 },
                        SupportsColor = true,
                        SupportsGrayscale = true,
                        SupportsDuplex = false,
                        SupportsAdf = false,
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WMI scanner detection failed");
        }

        return scanners;
    }

    private List<ScannerInfo> ParseNaps2DeviceList(string output)
    {
        var scanners = new List<ScannerInfo>();
        var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed)) continue;

            var match = Naps2DeviceLineRegex().Match(trimmed);
            if (match.Success)
            {
                var id = match.Groups[1].Value.Trim();
                var name = match.Groups.Count > 2 ? match.Groups[2].Value.Trim() : id;

                scanners.Add(new ScannerInfo
                {
                    Id = id,
                    DeviceId = id,
                    Name = name,
                    Manufacturer = "Unknown",
                    Model = name,
                    DeviceType = "TWAIN",
                    IsAvailable = true,
                    IsDefault = scanners.Count == 0,
                    ConnectionType = GetConnectionType(name),
                    SupportedResolutions = new List<int> { 75, 100, 150, 200, 300, 400, 600, 1200 },
                    SupportsColor = true,
                    SupportsGrayscale = true,
                    SupportsDuplex = false,
                    SupportsAdf = false,
                });
            }
            else if (!trimmed.StartsWith("No", StringComparison.OrdinalIgnoreCase) &&
                     !trimmed.StartsWith("Error", StringComparison.OrdinalIgnoreCase))
            {
                scanners.Add(new ScannerInfo
                {
                    Id = trimmed,
                    DeviceId = trimmed,
                    Name = trimmed,
                    Manufacturer = "Unknown",
                    Model = trimmed,
                    DeviceType = "TWAIN",
                    IsAvailable = true,
                    IsDefault = scanners.Count == 0,
                    ConnectionType = "USB",
                    SupportedResolutions = new List<int> { 75, 100, 150, 200, 300, 400, 600, 1200 },
                    SupportsColor = true,
                    SupportsGrayscale = true,
                    SupportsDuplex = false,
                    SupportsAdf = false,
                });
            }
        }

        return scanners;
    }

    private static string GetConnectionType(string name)
    {
        var lower = name.ToLower();
        if (lower.Contains("network") || lower.Contains("wifi") || lower.Contains("airscan") || lower.Contains("escl"))
            return "Network";
        if (lower.Contains("bluetooth"))
            return "Bluetooth";
        return "USB";
    }

    private string RunNaps2Process(string arguments, CancellationToken ct = default, int timeoutMs = 30000)
    {
        if (_naps2ExePath == null)
            throw new InvalidOperationException("NAPS2 executable not found");

        using var proc = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = _naps2ExePath,
                Arguments = arguments,
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

        _logger.LogDebug("NAPS2 exit code: {Code}, error: {Error}", proc.ExitCode, error);
        return output;
    }

    private static string? FindNaps2Executable()
    {
        if (!_isWindows) return null;

        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "NAPS2", "NAPS2.Console.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "NAPS2", "NAPS2.Console.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NAPS2", "NAPS2.Console.exe"),
            "NAPS2.Console.exe",
            "naps2.com",
            "naps2.exe",
        };

        foreach (var candidate in candidates)
        {
            try
            {
                if (Path.IsPathRooted(candidate))
                {
                    if (File.Exists(candidate)) return candidate;
                }
                else
                {
                    var found = Which(candidate);
                    if (found != null) return found;
                }
            }
            catch
            {
                // Try next
            }
        }

        return null;
    }

    private static string? Which(string executable)
    {
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "where",
                    Arguments = executable,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }
            };
            proc.Start();
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(3000);

            if (proc.ExitCode == 0)
            {
                var line = output.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                return line?.Trim();
            }
        }
        catch { }
        return null;
    }

    private static string GetNaps2ColorMode(string mode) => mode.ToLower() switch
    {
        "color" => "Color",
        "grayscale" or "gray" => "Gray",
        "black_white" or "blackwhite" or "lineart" => "BlackAndWhite",
        _ => "Color",
    };

    private static SkiaSharp.SKEncodedImageFormat GetSkiaFormat(string ext) => ext switch
    {
        "jpg" or "jpeg" => SkiaSharp.SKEncodedImageFormat.Jpeg,
        "tiff" or "tif" => SkiaSharp.SKEncodedImageFormat.Png,
        "bmp" => SkiaSharp.SKEncodedImageFormat.Bmp,
        _ => SkiaSharp.SKEncodedImageFormat.Png,
    };

    [GeneratedRegex(@"^([^\t]+)\t+(.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex Naps2DeviceLineRegex();
}