package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var embeddedDist embed.FS

// GetEmbeddedFS returns the embedded file system rooted at the dist directory.
func GetEmbeddedFS() fs.FS {
	sub, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		return embeddedDist
	}
	return sub
}
