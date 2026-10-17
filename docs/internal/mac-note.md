1. Trik Otomatis Lewat Script Install (install.sh)

Karena kamu menggunakan script bash untuk instalasi, kamu bisa menyisipkan perintah untuk menghapus atribut karantina macOS secara otomatis saat berkas diunduh.
Saat macOS mengunduh file dari internet (lewat curl atau wget), sistem akan menempelkan atribut bernama com.apple.quarantine. Atribut inilah yang memicu blokir Gatekeeper. Kamu bisa memodifikasi berkas scripts/install.sh milikmu menjadi seperti ini:
bash
# ... setelah script mengunduh binary ke folder ./bin/ ...

# Hapus paksa atribut karantina agar bisa langsung dijalankan
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "⚡ Mengonfigurasi izin keamanan untuk macOS..."
    xattr -d com.apple.quarantine ./bin/aegiscode-darwin-arm64 2>/dev/null || true
    chmod +x ./bin/aegiscode-darwin-arm64
fi

# Jalankan aplikasi
./bin/aegiscode-darwin-arm64 --open
Use code with caution.
Dengan cara ini, pengguna yang menjalankan 1-line quickstart kamu tidak akan melihat pop-up eror Gatekeeper karena atribut karantinanya langsung dihapus oleh skrip instalasi.

2. Edukasi "Right-Click Open" di README

Jika pengguna mengunduh berkas .dmg atau .zip secara manual lewat browser, cara di atas tidak akan berjalan karena mereka membukanya lewat Finder. Kamu cukup menambahkan catatan kecil di tabel Platform Distribution pada README kamu:
💡 Tip untuk Pengguna macOS: Jika muncul pesan "Developer cannot be verified", jangan klik Move to Trash. Cukup buka folder bin/ di Finder, klik kanan (atau tekan Control + Klik) pada ikon AegisCode, lalu pilih Open. Setelah itu, klik tombol Open sekali lagi untuk memberikan izin permanen.

3. Distribusikan Lewat Homebrew (Alternatif Elegan)

Daripada menyuruh pengguna mengunduh berkas binary mentah, kamu bisa mendaftarkan AegisCode ke Homebrew (Pengelola paket populer untuk Mac). Kamu tinggal membuat repository baru bernama homebrew-tap.
Homebrew dijalankan lewat Terminal, sehingga Gatekeeper cenderung lebih longgar terhadap aplikasi yang dipasang melaluinya. Pengguna Mac Mini atau MacBook di luar sana cukup mengetik:

```bash
brew tap aditlab-code/aegiscode
brew install aegiscode
Use code with caution.
```

Cara ini gratis, terlihat sangat profesional di mata sesama developer, dan menghemat waktu instalasi.
