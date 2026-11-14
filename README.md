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
