{{- $content := printf "%s" .RawContent -}}
{{- range .Resources -}}
  {{- $content = replace $content (printf "(%s)" .Name) (printf "(%s)" .Permalink) -}}
  {{- $content = replace $content (printf "(%s " .Name) (printf "(%s " .Permalink) -}}
  {{- $content = replace $content (printf "src=\"%s\"" .Name) (printf "src=\"%s\"" .Permalink) -}}
  {{- $content = replace $content (printf "href=\"%s\"" .Name) (printf "href=\"%s\"" .Permalink) -}}
{{- end -}}
{{ $content }}
