# ============================================================================
# Dev server estático para o Dirty Money (sem Node/Python).
# Uso:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8123]
# Depois abra:  http://localhost:8123/
# Ctrl+C para parar.
# ============================================================================
param([int]$Port = 8123)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.webp' = 'image/webp'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.glb'  = 'model/gltf-binary'
    '.gltf' = 'model/gltf+json'
    '.wasm' = 'application/wasm'
    '.webmanifest' = 'application/manifest+json'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Dirty Money dev server -> http://localhost:$Port/  (root: $root)"
Write-Host "Ctrl+C para parar."

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        # Erro numa requisição (ex.: navegador cancelou no meio) não pode derrubar o servidor.
        try {
            $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            # Ferramentas de arte (tools/carros, tools/personagens, tools/personagens3d): PUT /__save/assets/... grava o atlas gerado no disco
            # (e a malha 3D, em tools/asset_baker/generator/malha3d.js). Só nesses lugares e só para .js/.json/.png (o servidor só escuta em localhost).
            if ($ctx.Request.HttpMethod -eq 'PUT' -and $rel.StartsWith('__save/')) {
                $dest = [System.IO.Path]::GetFullPath((Join-Path $root $rel.Substring(7)))
                $assets = [System.IO.Path]::GetFullPath((Join-Path $root 'assets')) + [System.IO.Path]::DirectorySeparatorChar
                $okExt = @('.js', '.json', '.png') -contains [System.IO.Path]::GetExtension($dest).ToLower()
                $mesh = [System.IO.Path]::GetFullPath((Join-Path $root 'tools/asset_baker/generator/malha3d.js'))
                if (($dest.StartsWith($assets, [System.StringComparison]::OrdinalIgnoreCase) -or $dest -eq $mesh) -and $okExt) {
                    $ms = New-Object System.IO.MemoryStream
                    $ctx.Request.InputStream.CopyTo($ms)
                    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($dest)) | Out-Null
                    [System.IO.File]::WriteAllBytes($dest, $ms.ToArray())
                    Write-Host "salvo: $dest ($($ms.Length) bytes)"
                    $ctx.Response.StatusCode = 204
                } else { $ctx.Response.StatusCode = 403 }
                continue
            }
            if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
            $path = Join-Path $root $rel
            if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }      # pasta → index.html (ex.: /tools/carros/)

            if (Test-Path $path -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($path).ToLower()
                $type = $mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($path)
                $ctx.Response.ContentType = $type
                $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
                $ctx.Response.ContentLength64 = $bytes.Length
                if ($ctx.Request.HttpMethod -ne 'HEAD') {
                    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $ctx.Response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - $rel")
                $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch {
            Write-Host "req falhou: $($_.Exception.Message)"
        } finally {
            try { $ctx.Response.OutputStream.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
