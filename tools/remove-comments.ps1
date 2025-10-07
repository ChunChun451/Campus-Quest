$ErrorActionPreference = 'Stop'

function Remove-HtmlComments {
    param([string]$Content)
    return [regex]::Replace($Content, '<!--[\s\S]*?-->', '')
}

function Remove-CssComments {
    param([string]$Content)
    # Robust CSS comment pattern (does not break on nested /* */ occurrences)
    $pattern = '/\*[^*]*\*+(?:[^/*][^*]*\*+)*/'
    return [regex]::Replace($Content, $pattern, '')
}

function Remove-JsComments {
    param([string]$Content)
    # Remove block comments
    $noBlock = [regex]::Replace($Content, '/\*[\s\S]*?\*/', '')
    # Remove line comments but avoid protocols like http:// or https:// via negative lookbehind
    $noLine = [regex]::Replace($noBlock, '(?<!:)//.*', '', 'Multiline')
    return $noLine
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

Get-ChildItem -Path $root -Recurse -File | ForEach-Object {
    $ext = $_.Extension.ToLowerInvariant()
    if ($ext -in @('.html', '.css', '.js')) {
        $content = Get-Content -Raw -LiteralPath $_.FullName
        switch ($ext) {
            '.html' { $new = Remove-HtmlComments -Content $content }
            '.css'  { $new = Remove-CssComments  -Content $content }
            '.js'   { $new = Remove-JsComments   -Content $content }
        }
        if ($null -ne $new) { Set-Content -NoNewline -LiteralPath $_.FullName -Value $new }
    }
}


