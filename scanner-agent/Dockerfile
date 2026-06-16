FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ScannerAgent.csproj .
RUN dotnet restore ScannerAgent.csproj

COPY . .
RUN dotnet publish ScannerAgent.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libusb-1.0-0 \
        libc6-dev \
        libicu-dev \
        libgdiplus \
        libx11-6 \
        libcups2-dev \
        sane-utils \
        sane-airscan \
        hplip \
        curl \
        && rm -rf /var/lib/apt/lists/*

# Copy SANE config for HP scanner support
RUN if [ -f /etc/sane.d/hpaio.conf ]; then \
        echo "hpaio" >> /etc/sane.d/dll.conf 2>/dev/null || true; \
    fi

# Ensure scanner group exists and app user belongs to it
RUN groupadd -f scanner && \
    groupadd -f lp && \
    usermod -a -G scanner,lp,root www-data 2>/dev/null || true

EXPOSE 5000

ENV ASPNETCORE_URLS=http://+:5000
ENV ScanSettings__TempFolder=/tmp/scans
ENV SCANNER_PROVIDER=sane

WORKDIR /app
COPY --from=build /app .

RUN mkdir -p /tmp/scans /tmp/scans/pdfs /tmp/scans/thumbnails

# Test SANE availability
RUN scanimage -V 2>/dev/null || true

ENTRYPOINT ["dotnet", "ScannerAgent.dll"]
