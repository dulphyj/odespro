using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ScannerAgent.Models;

namespace ScannerAgent.Services;

public class OcrBridgeService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<OcrBridgeService> _logger;
    private readonly IConfiguration _configuration;

    public bool IsEnabled { get; private set; }

    public OcrBridgeService(
        HttpClient httpClient,
        ILogger<OcrBridgeService> logger,
        IConfiguration configuration)
    {
        _httpClient = httpClient;
        _logger = logger;
        _configuration = configuration;
        IsEnabled = !string.IsNullOrEmpty(_configuration.GetValue<string>("OcrServiceUrl"))
                     || !string.IsNullOrEmpty(_configuration.GetValue<string>("BackendUrl"));
    }

    public async Task<string?> SendToOcrServiceAsync(string imagePath)
    {
        if (!IsEnabled)
        {
            _logger.LogDebug("OCR service not configured, skipping OCR for {Path}", imagePath);
            return null;
        }

        if (!File.Exists(imagePath))
        {
            _logger.LogWarning("Image not found for OCR: {Path}", imagePath);
            return null;
        }

        try
        {
            var ocrUrl = GetOcrUrl();
            if (string.IsNullOrEmpty(ocrUrl))
            {
                return null;
            }

            var imageBytes = await File.ReadAllBytesAsync(imagePath);
            var fileName = Path.GetFileName(imagePath);

            using var formData = new MultipartFormDataContent();
            formData.Add(new ByteArrayContent(imageBytes), "file", fileName);
            formData.Add(new StringContent("spa"), "language");

            var response = await _httpClient.PostAsync(ocrUrl, formData);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<OcrResult>();
                var text = result?.Text ?? result?.Content ?? string.Empty;
                _logger.LogInformation("OCR completed for {Path}: {Length} chars", imagePath, text.Length);
                return text;
            }

            _logger.LogWarning("OCR service returned {StatusCode} for {Path}",
                response.StatusCode, imagePath);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OCR processing failed for {Path}", imagePath);
            return null;
        }
    }

    public async Task<string?> SendPdfToOcrService(string pdfPath)
    {
        if (!IsEnabled)
        {
            return null;
        }

        if (!File.Exists(pdfPath))
        {
            _logger.LogWarning("PDF not found for OCR: {Path}", pdfPath);
            return null;
        }

        try
        {
            var pdfOcrUrl = GetPdfOcrUrl();
            if (string.IsNullOrEmpty(pdfOcrUrl))
            {
                return await SendPdfByImageExtractionAsync(pdfPath);
            }

            var pdfBytes = await File.ReadAllBytesAsync(pdfPath);
            var fileName = Path.GetFileName(pdfPath);

            using var formData = new MultipartFormDataContent();
            formData.Add(new ByteArrayContent(pdfBytes), "file", fileName);
            formData.Add(new StringContent("spa"), "language");

            var response = await _httpClient.PostAsync(pdfOcrUrl, formData);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<OcrResult>();
                _logger.LogInformation("PDF OCR completed for {Path}", pdfPath);
                return result?.Text ?? result?.Content;
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PDF OCR processing failed for {Path}", pdfPath);
            return null;
        }
    }

    private async Task<string?> SendPdfByImageExtractionAsync(string pdfPath)
    {
        try
        {
            using var input = File.OpenRead(pdfPath);
            using var ms = new MemoryStream();
            await input.CopyToAsync(ms);
            ms.Position = 0;

            var ocrUrl = GetOcrUrl();
            if (string.IsNullOrEmpty(ocrUrl)) return null;

            using var formData = new MultipartFormDataContent();
            formData.Add(new ByteArrayContent(ms.ToArray()), "file", Path.GetFileName(pdfPath));
            formData.Add(new StringContent("spa"), "language");

            var response = await _httpClient.PostAsync(ocrUrl, formData);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<OcrResult>();
                return result?.Text ?? result?.Content;
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PDF OCR fallback failed for {Path}", pdfPath);
            return null;
        }
    }

    private string? GetOcrUrl()
    {
        var ocrUrl = _configuration.GetValue<string>("OcrServiceUrl");
        if (!string.IsNullOrEmpty(ocrUrl)) return ocrUrl;

        var backendUrl = _configuration.GetValue<string>("BackendUrl");
        if (!string.IsNullOrEmpty(backendUrl)) return $"{backendUrl}/api/ocr/process";

        return null;
    }

    private string? GetPdfOcrUrl()
    {
        var ocrUrl = _configuration.GetValue<string>("OcrServiceUrl");
        if (!string.IsNullOrEmpty(ocrUrl)) return $"{ocrUrl.TrimEnd('/')}/pdf";

        var backendUrl = _configuration.GetValue<string>("BackendUrl");
        if (!string.IsNullOrEmpty(backendUrl)) return $"{backendUrl}/api/ocr/process-pdf";

        return null;
    }

    private class OcrResult
    {
        public string? Text { get; set; }
        public string? Content { get; set; }
    }
}
