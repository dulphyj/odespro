using SkiaSharp;
using ScannerAgent.Models;

namespace ScannerAgent.Services;

public class ImageService
{
    private readonly ILogger<ImageService> _logger;

    public ImageService(ILogger<ImageService> logger)
    {
        _logger = logger;
    }

    public async Task<string> SaveImageAsync(byte[] data, string format, string directory, string fileName)
    {
        Directory.CreateDirectory(directory);

        var ext = format.ToLowerInvariant() switch
        {
            "jpeg" or "jpg" => ".jpg",
            "png" => ".png",
            "tiff" or "tif" => ".tiff",
            "bmp" => ".bmp",
            _ => ".jpg"
        };

        var filePath = Path.Combine(directory, $"{fileName}{ext}");

        await File.WriteAllBytesAsync(filePath, data);

        _logger.LogDebug("Saved image to {Path} ({Size} bytes)", filePath, data.Length);
        return filePath;
    }

    public string ConvertFormat(string inputPath, string outputFormat)
    {
        var ext = outputFormat.ToLowerInvariant() switch
        {
            "jpeg" or "jpg" => ".jpg",
            "png" => ".png",
            "tiff" or "tif" => ".tiff",
            _ => ".jpg"
        };

        var outputPath = Path.ChangeExtension(inputPath, ext);

        using var input = File.OpenRead(inputPath);
        using var stream = new SKManagedStream(input);
        using var codec = SKCodec.Create(stream);
        using var bitmap = SKBitmap.Decode(codec);

        if (bitmap == null)
        {
            _logger.LogWarning("Failed to decode image: {Path}", inputPath);
            return inputPath;
        }

        var image = SKImage.FromBitmap(bitmap);
        var encoded = outputFormat.ToLowerInvariant() switch
        {
            "png" => image.Encode(SKEncodedImageFormat.Png, 100),
            "jpeg" or "jpg" => image.Encode(SKEncodedImageFormat.Jpeg, 90),
            "tiff" or "tif" => image.Encode(SKEncodedImageFormat.Png, 90),
            _ => image.Encode(SKEncodedImageFormat.Jpeg, 90)
        };

        using var output = File.OpenWrite(outputPath);
        encoded.SaveTo(output);

        _logger.LogDebug("Converted {Input} to {Output}", inputPath, outputPath);
        return outputPath;
    }

    public async Task<string> GenerateThumbnailAsync(string inputPath, string outputDirectory, int maxWidth = 300)
    {
        Directory.CreateDirectory(outputDirectory);

        var fileName = $"thumb_{Path.GetFileNameWithoutExtension(inputPath)}.jpg";
        var outputPath = Path.Combine(outputDirectory, fileName);

        using var input = File.OpenRead(inputPath);
        using var stream = new SKManagedStream(input);
        using var bitmap = SKBitmap.Decode(stream);

        if (bitmap == null)
        {
            _logger.LogWarning("Failed to decode image for thumbnail: {Path}", inputPath);
            return inputPath;
        }

        var scale = (double)maxWidth / bitmap.Width;
        var newHeight = (int)(bitmap.Height * scale);

        if (scale >= 1.0)
        {
            await File.WriteAllBytesAsync(outputPath, await File.ReadAllBytesAsync(inputPath));
            return outputPath;
        }

        using var resized = bitmap.Resize(new SKImageInfo(maxWidth, newHeight), SKFilterQuality.Medium);
        if (resized == null)
        {
            return inputPath;
        }

        using var image = SKImage.FromBitmap(resized);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 75);

        await using var output = File.OpenWrite(outputPath);
        encoded.SaveTo(output);

        return outputPath;
    }

    public async Task<string> ProcessImageAsync(string inputPath, string outputPath, ImageProcessingOptions options)
    {
        using var input = File.OpenRead(inputPath);
        using var stream = new SKManagedStream(input);
        using var bitmap = SKBitmap.Decode(stream);

        if (bitmap == null)
        {
            _logger.LogWarning("Failed to decode image for processing: {Path}", inputPath);
            return inputPath;
        }

        var current = bitmap;

        if (options.Rotation != 0)
        {
            current = RotateBitmap(current, (float)options.Rotation);
        }

        if (options.AutoCrop)
        {
            current = AutoCropInternal(current);
        }

        if (options.Deskew)
        {
            current = DeskewInternal(current);
        }

        if (options.Brightness != 0 || options.Contrast != 0)
        {
            current = ApplyColorAdjustments(current, options.Brightness, options.Contrast);
        }

        using var image = SKImage.FromBitmap(current);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, options.Quality);

        await using var output = File.OpenWrite(outputPath);
        encoded.SaveTo(output);

        if (current != bitmap)
        {
            current.Dispose();
        }

        _logger.LogDebug("Processed image: {Input} -> {Output}", inputPath, outputPath);
        return outputPath;
    }

    public async Task<bool> DetectEmptyPageAsync(string imagePath, double threshold = 0.05)
    {
        try
        {
            using var input = File.OpenRead(imagePath);
            using var stream = new SKManagedStream(input);
            using var bitmap = SKBitmap.Decode(stream);

            if (bitmap == null) return false;

            using var gray = ConvertToGray(bitmap);
            var totalPixels = gray.Width * gray.Height;
            var whitePixels = 0;

            unsafe
            {
                var pixels = (byte*)gray.GetPixels().ToPointer();
                for (var i = 0; i < totalPixels; i++)
                {
                    if (pixels[i] > 240) whitePixels++;
                }
            }

            var whiteRatio = (double)whitePixels / totalPixels;
            return whiteRatio >= (1.0 - threshold);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error detecting empty page for {Path}", imagePath);
            return false;
        }
    }

    public string AutoCrop(string inputPath)
    {
        using var input = File.OpenRead(inputPath);
        using var stream = new SKManagedStream(input);
        using var bitmap = SKBitmap.Decode(stream);

        if (bitmap == null) return inputPath;

        using var cropped = AutoCropInternal(bitmap);
        using var image = SKImage.FromBitmap(cropped);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 90);

        var outputPath = Path.ChangeExtension(inputPath, ".jpg");
        using var output = File.OpenWrite(outputPath);
        encoded.SaveTo(output);

        return outputPath;
    }

    public string Deskew(string inputPath)
    {
        using var input = File.OpenRead(inputPath);
        using var stream = new SKManagedStream(input);
        using var bitmap = SKBitmap.Decode(stream);

        if (bitmap == null) return inputPath;

        using var deskewed = DeskewInternal(bitmap);
        using var image = SKImage.FromBitmap(deskewed);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 90);

        var outputPath = Path.ChangeExtension(inputPath, ".jpg");
        using var output = File.OpenWrite(outputPath);
        encoded.SaveTo(output);

        return outputPath;
    }

    private static SKBitmap RotateBitmap(SKBitmap bitmap, float degrees)
    {
        var rotated = new SKBitmap(bitmap.Height, bitmap.Width);
        using var canvas = new SKCanvas(rotated);
        canvas.Translate(rotated.Width / 2f, rotated.Height / 2f);
        canvas.RotateDegrees(degrees);
        canvas.DrawBitmap(bitmap, -bitmap.Width / 2f, -bitmap.Height / 2f);
        return rotated;
    }

    private static SKBitmap AutoCropInternal(SKBitmap bitmap)
    {
        var threshold = 10;
        var left = 0;
        var right = bitmap.Width - 1;
        var top = 0;
        var bottom = bitmap.Height - 1;

        var pixels = new SKColor[bitmap.Width * bitmap.Height];
        for (var y = 0; y < bitmap.Height; y++)
        {
            for (var x = 0; x < bitmap.Width; x++)
            {
                pixels[y * bitmap.Width + x] = bitmap.GetPixel(x, y);
            }
        }

        bool IsBorderColor(SKColor c) =>
            c.Red > 255 - threshold && c.Green > 255 - threshold && c.Blue > 255 - threshold;

        for (var x = 0; x < bitmap.Width; x++)
        {
            var allBorder = true;
            for (var y = 0; y < bitmap.Height; y++)
            {
                if (!IsBorderColor(pixels[y * bitmap.Width + x]))
                {
                    allBorder = false;
                    break;
                }
            }
            if (!allBorder) { left = x; break; }
        }

        for (var x = bitmap.Width - 1; x >= 0; x--)
        {
            var allBorder = true;
            for (var y = 0; y < bitmap.Height; y++)
            {
                if (!IsBorderColor(pixels[y * bitmap.Width + x]))
                {
                    allBorder = false;
                    break;
                }
            }
            if (!allBorder) { right = x; break; }
        }

        for (var y = 0; y < bitmap.Height; y++)
        {
            var allBorder = true;
            for (var x = 0; x < bitmap.Width; x++)
            {
                if (!IsBorderColor(pixels[y * bitmap.Width + x]))
                {
                    allBorder = false;
                    break;
                }
            }
            if (!allBorder) { top = y; break; }
        }

        for (var y = bitmap.Height - 1; y >= 0; y--)
        {
            var allBorder = true;
            for (var x = 0; x < bitmap.Width; x++)
            {
                if (!IsBorderColor(pixels[y * bitmap.Width + x]))
                {
                    allBorder = false;
                    break;
                }
            }
            if (!allBorder) { bottom = y; break; }
        }

        if (left >= right || top >= bottom) return bitmap.Copy();

        var cropWidth = right - left + 1;
        var cropHeight = bottom - top + 1;
        var cropped = new SKBitmap(cropWidth, cropHeight);

        using var canvas = new SKCanvas(cropped);
        canvas.DrawBitmap(bitmap, new SKRect(left, top, right + 1, bottom + 1), new SKRect(0, 0, cropWidth, cropHeight));

        return cropped;
    }

    private static SKBitmap DeskewInternal(SKBitmap bitmap)
    {
        try
        {
            using var gray = ConvertToGray(bitmap);
            var angle = DetectSkewAngle(gray);
            if (Math.Abs(angle) < 0.5) return bitmap.Copy();
            return RotateBitmap(bitmap, (float)-angle);
        }
        catch
        {
            return bitmap.Copy();
        }
    }

    private static double DetectSkewAngle(SKBitmap grayBitmap)
    {
        var step = 0.5;
        var bestAngle = 0.0;
        var bestVariance = 0.0;

        for (var angle = -5.0; angle <= 5.0; angle += step)
        {
            var variance = CalculateProjectionVariance(grayBitmap, angle);
            if (variance > bestVariance)
            {
                bestVariance = variance;
                bestAngle = angle;
            }
        }

        return bestAngle;
    }

    private static double CalculateProjectionVariance(SKBitmap bitmap, double angle)
    {
        var rad = angle * Math.PI / 180.0;
        var cos = Math.Cos(rad);
        var sin = Math.Sin(rad);
        var cx = bitmap.Width / 2.0;
        var cy = bitmap.Height / 2.0;

        var bins = new int[bitmap.Width];
        Array.Fill(bins, 0);

        unsafe
        {
            var pixels = (byte*)bitmap.GetPixels().ToPointer();
            for (var y = 0; y < bitmap.Height; y++)
            {
                for (var x = 0; x < bitmap.Width; x++)
                {
                    if (pixels[y * bitmap.Width + x] < 128)
                    {
                        var px = (x - cx) * cos - (y - cy) * sin + cx;
                        var bin = (int)Math.Round(px);
                        if (bin >= 0 && bin < bitmap.Width)
                        {
                            bins[bin]++;
                        }
                    }
                }
            }
        }

        var mean = bins.Average();
        return bins.Sum(b => (b - mean) * (b - mean)) / bins.Length;
    }

    private static SKBitmap ConvertToGray(SKBitmap bitmap)
    {
        var gray = new SKBitmap(bitmap.Width, bitmap.Height, SKColorType.Gray8, SKAlphaType.Opaque);

        unsafe
        {
            var srcPtr = (byte*)bitmap.GetPixels().ToPointer();
            var dstPtr = (byte*)gray.GetPixels().ToPointer();

            for (var y = 0; y < bitmap.Height; y++)
            {
                for (var x = 0; x < bitmap.Width; x++)
                {
                    var srcIdx = (y * bitmap.Width + x) * 4;
                    var b = srcPtr[srcIdx];
                    var g = srcPtr[srcIdx + 1];
                    var r = srcPtr[srcIdx + 2];
                    dstPtr[y * bitmap.Width + x] = (byte)(0.2126 * r + 0.7152 * g + 0.0722 * b);
                }
            }
        }

        return gray;
    }

    private static SKBitmap ApplyColorAdjustments(SKBitmap bitmap, int brightness, int contrast)
    {
        var result = new SKBitmap(bitmap.Width, bitmap.Height);

        var brightnessFactor = brightness / 100.0f;
        var contrastFactor = (259.0f * (contrast + 255.0f)) / (255.0f * (259.0f - contrast));

        using var canvas = new SKCanvas(result);
        using var paint = new SKPaint
        {
            ColorFilter = SKColorFilter.CreateColorMatrix(new float[]
            {
                contrastFactor, 0, 0, 0, brightnessFactor * 255,
                0, contrastFactor, 0, 0, brightnessFactor * 255,
                0, 0, contrastFactor, 0, brightnessFactor * 255,
                0, 0, 0, 1, 0
            })
        };

        canvas.DrawBitmap(bitmap, 0, 0, paint);
        return result;
    }
}

public class ImageProcessingOptions
{
    public double Rotation { get; set; }
    public bool AutoCrop { get; set; }
    public bool Deskew { get; set; }
    public int Brightness { get; set; }
    public int Contrast { get; set; }
    public int Quality { get; set; } = 90;
}
