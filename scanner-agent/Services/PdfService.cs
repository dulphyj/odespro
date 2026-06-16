using SkiaSharp;

namespace ScannerAgent.Services;

public class PdfService
{
    private readonly ILogger<PdfService> _logger;

    public PdfService(ILogger<PdfService> logger)
    {
        _logger = logger;
    }

    public async Task<string> GeneratePdfFromImagesAsync(
        List<string> imagePaths,
        string outputPath,
        int compressionLevel = 75,
        string? title = null,
        string? author = null)
    {
        var validPaths = imagePaths.Where(File.Exists).ToList();
        if (validPaths.Count == 0)
        {
            throw new InvalidOperationException("No valid image paths provided for PDF generation");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

        using var pdfDoc = SKDocument.CreatePdf(outputPath);

        foreach (var imagePath in validPaths)
        {
            try
            {
                using var input = File.OpenRead(imagePath);
                using var stream = new SKManagedStream(input);
                using var codec = SKCodec.Create(stream);
                using var bitmap = SKBitmap.Decode(codec);

                if (bitmap == null)
                {
                    _logger.LogWarning("Failed to decode image for PDF: {Path}", imagePath);
                    continue;
                }

                float width = bitmap.Width;
                float height = bitmap.Height;
                float dpi = 72f;

                if (width > 0 && height > 0)
                {
                    dpi = Math.Min(width / 8.5f, height / 11f);
                    if (dpi < 72) dpi = 72;
                }

                var page = pdfDoc.BeginPage(width, height);
                using (page)
                {
                    page.DrawBitmap(bitmap, 0, 0);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to add image to PDF: {Path}", imagePath);
            }
        }

        pdfDoc.Close();
        _logger.LogInformation("PDF generated: {Path} with {Count} pages", outputPath, validPaths.Count);
        return outputPath;
    }

    public async Task<string> CompressPdfAsync(string inputPath, string outputPath, int compressionLevel)
    {
        _logger.LogInformation("PDF compress not supported with SkiaSharp, copying file");
        File.Copy(inputPath, outputPath, true);
        return await Task.FromResult(outputPath);
    }
}
