# Assistant Music AI — Trợ lý âm nhạc AI

Webapp tiếng Việt giúp cùng sáng tác bài hát: **melody + hợp âm + lời**, nghe thử ngay khi làm, kết nối **MIDI keyboard**. Thuần HTML/CSS/JS, không cần build, không cần server, không dùng API trả phí.

## Chạy
- Mở `index.html` bằng Chrome/Edge, hoặc bật GitHub Pages (Settings → Pages → branch `main` / root).
- Web MIDI cần Chrome/Edge và trang chạy HTTPS (GitHub Pages thỏa) hoặc `localhost`.

## Tính năng
- **Trợ lý đồng sáng tác**: vẽ/đàn motif 1–2 ô → *Gợi ý đoạn tiếp theo* → 3 phương án (Bám sát / Cân bằng / Phiêu) hiện dạng nốt ma, nghe thử, **Chọn / Tạo lại / Bỏ**. Cấu trúc câu AABA, ABAB…, kết mở/khép/kết bài, bám nốt hợp âm ở phách mạnh. *Tự hoàn thiện đến hết bài* điền phần còn lại.
- **Piano roll**: vẽ, kéo, đổi độ dài, chọn vùng, sao chép/dán/nhân đôi, căn lưới, đổi lực nhấn, dịch cung, zoom, undo/redo.
- **Hợp âm**: bảng hợp âm theo giọng (tam âm, 7th, sus, add9, 6), tiến trình phổ biến, *gợi ý hợp âm cho melody*, sửa từng hợp âm.
- **Lời**: gõ trực tiếp trên làn Lời hoặc tab Lời; đếm số tiếng so với số nốt; dán cả bài rồi chia vào ô nhịp; nhãn đoạn.
- **MIDI keyboard**: chơi trực tiếp, thu âm có đếm nhịp + căn nốt, nhập từng nốt, nhận diện hợp âm live → thêm vào làn hợp âm. Không có keyboard thì dùng bàn phím máy tính (A W S E D F T G Y H U J K).
- **Lưu & xuất**: tự lưu trình duyệt, `.json`, `.mid` (3 track, có lời + nhãn đoạn), `.txt` bản chép hợp âm + lời.

## Phím tắt
`Space` phát · `R` thu · `M` metronome · `B` lặp · `Ctrl+Z/Y` hoàn tác · `Ctrl+A/C/X/V/D` · `1–7` đặt hợp âm · `Delete` xoá · `?` xem đủ.

## Kiểm thử
```
node tests/logic.test.js
```
Kiểm tra lý thuyết nhạc, nhận diện hợp âm, bộ sinh melody (nốt trong âm giai, không nhảy quá quãng 8, không chồng nốt, kết bài ở chủ âm), xuất MIDI, undo/redo.

## Ghi chú
Bộ sinh melody dựa trên luật (không phải mô hình AI): biến đổi motif của bạn bằng lặp, chuyển bậc, đảo, biến tấu nhịp, kết câu. File `PROMPT.md` là prompt dùng để tạo dự án này.

## Phiên bản & phát hành
- Điện thoại: màn chính là các trang Trợ lý / Hợp âm / Lời / Cài đặt; bấm **Piano roll** để mở toàn màn hình ngang (2 ngón = cuộn + zoom, công cụ ✋ Cuộn).
- PC: giữ chuột phải xoá, nhấp đúp hợp âm, phím tắt, MIDI keyboard.
- Mỗi lần phát hành: `node tools/bump.js patch` (0.1.1 → 0.1.2 → …) hoặc `minor` (→ 0.2.0) → commit → push. App tự phát hiện (`version.json?t=…` bỏ qua cache) và hiện màn hình **bắt buộc cập nhật**.
- `.nojekyll` giúp GitHub Pages bỏ bước Jekyll nên triển khai nhanh hơn.

## Bảng "Lời & nốt" (không gian sáng tác chính)
- Mỗi ô nhịp = một dòng lời; tiếng thứ *i* ↔ nốt thứ *i* trong ô. Chạm một chữ → chọn nốt (gợi ý nốt thuộc hợp âm), chọn hợp âm tại chữ đó, đổi độ dài; nghe ngay.
- AI: **Hoàn thiện câu** (điền các chữ còn thiếu), **Làm lại**, **Hợp âm**, **Dòng tiếp**. Nốt bám dấu thanh tiếng Việt (sắc/ngã lên, huyền/nặng xuống); chữ lệch dấu được tô vàng.
- PC: ← → chọn chữ, ↑ ↓ đổi nốt, 1–7 chọn bậc âm, Enter sửa lời. Dán nhiều dòng để chia vào các ô liên tiếp.
- Mỗi bản phát hành: thêm mục mới lên đầu `js/changelog.js` → `node tools/bump.js patch` → commit → push. Popup "Có gì mới" tự hiện một lần cho mỗi phiên bản.

## v0.1.3 — Hát để tạo melody & Piano roll Pro
- 🎤 **Hát → melody** (`js/voice.js`): micro → dò cao độ YIN → tách nốt → căn nhịp (1/16, 1/8, 1/4) → chèn tại con trỏ. Cần HTTPS hoặc localhost để dùng micro.
- **Piano roll Pro**: làn lực nhấn, khoá thang âm, Legato, Chia đôi, Đảo ngược, Ép thang, Tự nhiên, Lặp vùng, Vừa khung (thanh `#proBar`).


## Thư mục dự án & sao lưu
- **Gốc offline trên PC:** `D:\MusicAi` (bản clone của repo GitHub `haiduy2405/ama`). **Online:** GitHub → https://haiduy2405.github.io/AMA/
- `Mo-app.bat` — chạy app offline ngay trên PC (cần Node.js; mở `http://localhost:8080`). Micro/MIDI chỉ chạy trên localhost/HTTPS nên đừng mở thẳng file `index.html`.
- `Cap-nhat.bat` — kéo bản mới nhất từ GitHub về `D:\MusicAi`.
- `assets-src/` — ảnh gốc (PNG lớn, nguồn ChatGPT…), **không** đẩy lên GitHub; chỉ bản đã nén vào `assets/`.
- Sao lưu bài hát: nút **Lưu** → file `.muse.json` (giữ ở `D:\MusicAi\Bai-hat`). Bài trong trình duyệt còn nằm ở “Bài gần đây”.

## Tương thích
| Nền tảng | Trạng thái |
|---|---|
| PC (Chrome/Edge) | Đầy đủ: MIDI keyboard, phím tắt, chuột phải |
| Android (Chrome) | Đầy đủ, cài PWA, MIDI USB/Bluetooth, nút Back đóng piano roll |
| iPhone/iPad (Safari) | Hát/vẽ/đàn ảo, cài “Thêm vào MH chính”; **không có Web MIDI** (giới hạn của Safari) |
