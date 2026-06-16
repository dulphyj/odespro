using System.Text.Json.Serialization;

namespace ScannerAgent.Models;

public class ScannerInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("manufacturer")]
    public string Manufacturer { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("device_type")]
    public string DeviceType { get; set; } = "TWAIN";

    [JsonPropertyName("is_default")]
    public bool IsDefault { get; set; }

    [JsonPropertyName("is_available")]
    public bool IsAvailable { get; set; } = true;

    [JsonPropertyName("connection_type")]
    public string ConnectionType { get; set; } = "USB";

    [JsonPropertyName("serial_number")]
    public string SerialNumber { get; set; } = string.Empty;

    [JsonPropertyName("supported_resolutions")]
    public List<int> SupportedResolutions { get; set; } = new() { 100, 200, 300, 400, 600 };

    [JsonPropertyName("supports_color")]
    public bool SupportsColor { get; set; } = true;

    [JsonPropertyName("supports_grayscale")]
    public bool SupportsGrayscale { get; set; } = true;

    [JsonPropertyName("supports_duplex")]
    public bool SupportsDuplex { get; set; }

    [JsonPropertyName("supports_adf")]
    public bool SupportsAdf { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "Idle";
}