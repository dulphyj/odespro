using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using ScannerAgent.Endpoints;
using ScannerAgent.Services;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://0.0.0.0:5000");

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddHttpClient("BackendClient", client =>
{
    var backendUrl = builder.Configuration.GetValue<string>("BackendUrl") ?? "http://backend:8000";
    client.BaseAddress = new Uri(backendUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});

builder.Services.AddHttpClient<OcrBridgeService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
});

builder.Services.AddSingleton<ScanJobService>();
builder.Services.AddSingleton<ImageService>();
builder.Services.AddSingleton<PdfService>();
builder.Services.AddSingleton<ScannerDiscoveryService>();
builder.Services.AddSingleton<ScannerStatusService>();

// Register the appropriate scanner provider based on the platform
var providerType = builder.Configuration.GetValue<string>("ScannerProvider");
if (string.IsNullOrEmpty(providerType))
{
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        providerType = "naps2";
    else
        providerType = "sane";
}

switch (providerType.ToLower())
{
    case "naps2":
        builder.Services.AddSingleton<IScannerProvider, Naps2ScannerProvider>();
        break;
    case "sane":
        builder.Services.AddSingleton<IScannerProvider, SaneScannerProvider>();
        break;
    default:
        builder.Services.AddSingleton<IScannerProvider, Naps2ScannerProvider>();
        break;
}

builder.Services.AddSingleton<ScannerService>();

builder.Services.AddHostedService<ScannerDiscoveryHostedService>();

var app = builder.Build();

app.UseCors();

app.MapScannerEndpoints();

app.MapGet("/", () => Results.Ok(new
{
    service = "Scanner Agent",
    version = "1.0.0",
    status = "running",
    docs = new
    {
        scanners = "GET /api/scanners",
        scan = "POST /api/scan",
        health = "GET /api/status/health"
    }
}));

app.Run();

public class ScannerDiscoveryHostedService : IHostedService
{
    private readonly ScannerDiscoveryService _discovery;

    public ScannerDiscoveryHostedService(ScannerDiscoveryService discovery)
    {
        _discovery = discovery;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _discovery.StartBackgroundRefresh();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _discovery.StopBackgroundRefresh();
        return Task.CompletedTask;
    }
}
