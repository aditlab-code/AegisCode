1. Gambar png jpg svg 

- Tab view dapat menampilkan citra dengan static. Relatif terhadap ukuran defaultnya
- dari static default ukuran, menjadi dinamis. Dapat di zoom dan drag. Dengan constrain max zoom dan min zoom. Mencegah infinity loop

2. Markdown

- tab view dapat menampilkan preview render markdown bawaan yang telah ada.
- tab view dapat secara dinamis menampilkan perubahan di file editor. Maka preview akan secara realtime merefresh. Sanitasi debounce, agar dom tidak infinity loop.
- tab view markdown tersync ukuran fonts dan layoutnya, sehingga ketika editor scrolling, dengan markdown preview akan ikut sync scroll. Perlu pencegahan Big O, infinity sync. Perlu treshold agar proses sync ringan namun aman
- toolbar editor markdown di tabview seperti markdown enhanced. Ini ringan, diproses di tabview. Maka proses sync dengan editor otomatis tidak eror jika langkah sebelumnya tersanitasi dengan baik.

3. Pdf
- menggunakan pdf.js agar tidak berat. Ketika zoom in out hindari infinity 
- Perlu pencegahan Big O, infinity sync. Perlu treshold agar proses sync ringan namun aman.

4. Data table csv
- target file csv dengan delimiter koma dan titik koma. Harus melewati parsing dulu. Hati hati proses kolom tabel dengan row atau kolom banyak misal lebih dari 100. Proses akan di rebatch agar tetap dapat terender dengan baik.
- tabel ditampilkan html agar tetap ringan. Dengan css sederhana, warp jika teks lebar. Perlu tabview scrolling horizontal dan vertikal.
- karena mengurusi dataframe. Maka hati hati proses batch yang besar, perlu penanganan memory go lang backend