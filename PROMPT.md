# PROMPT — Muse Studio (webapp hỗ trợ sáng tác nhạc)

> Prompt tối ưu đã dùng để sinh ra dự án này. Dán nguyên văn cho Claude Code / Claude để tái tạo hoặc mở rộng.

## 1. Vai trò & mục tiêu
Bạn là senior front-end engineer kiêm nhạc sĩ/producer. Hãy xây **Muse Studio**: webapp tiếng Việt giúp người dùng **cùng sáng tác một bài hát hoàn chỉnh** (melody + hợp âm + lời), nghe thử ngay khi làm, chỉnh sửa tự do, có thể cắm **MIDI keyboard**.

Người dùng: người sáng tác không chuyên đến bán chuyên; có thể biết hoặc không biết đọc nhạc. Ưu tiên: *ý tưởng → nghe được → sửa được* trong vài giây.

## 2. Ràng buộc kỹ thuật
- Vanilla HTML/CSS/JS, **không build step, không backend, không API trả phí**. Chạy được bằng GitHub Pages (và mở file trực tiếp).
- Script thường (không ES module) để chạy được cả khi mở `file://`. Mỗi file gắn vào một namespace global `MS`.
- Âm thanh: Web Audio API tự tổng hợp (không file mẫu). MIDI: Web MIDI API (Chrome/Edge). Trình duyệt không hỗ trợ → báo rõ và vẫn dùng được bàn phím máy tính làm đàn.
- Lưu tự động `localStorage`; xuất/nhập `.json`; xuất `.mid` (SMF type 1); xuất bản chép lời + hợp âm `.txt`.
- Logic thuần (lý thuyết nhạc, sinh melody, nhận diện hợp âm, ghi MIDI) tách khỏi DOM để test bằng Node.

## 3. Mô hình dữ liệu
`song = { title, key (0-11), mode ('major'|'minor'), bpm, bars, timeSig [4,4], notes[], chords[], lyrics{barIndex:text}, sections[] }`
- Lưới 16 (step = nốt 1/16). `note = {id, start, dur, pitch (MIDI), vel}`.
- `chord = {id, start, dur, root (0-11), quality, bass?}`.
- Mọi thao tác sửa đi qua store có **undo/redo** (snapshot) và autosave.

## 4. Tính năng bắt buộc
### 4.1 Sinh melody đồng sáng tác
1. **Hoàn thiện khuôn nhạc**: người dùng gõ/đàn một motif 1–2 ô nhịp; hệ thống phân tích (nhịp điệu, khoảng cách quãng theo bậc âm, đường nét) rồi tạo **3 phương án** cho đoạn kế tiếp (2 hoặc 4 ô nhịp) hiển thị dạng "nốt ma" trên piano roll, nghe thử từng phương án, **Chọn / Tạo lại / Bỏ**.
2. Kỹ thuật sinh: lặp lại, chuyển bậc (sequence), đảo/biến tấu nhịp, đường nét hình vòm, nốt hợp âm ở phách mạnh khi đã có hợp âm, **kết câu** (half cadence ở câu 2, về chủ âm ở câu cuối), cấu trúc câu AABA / ABAB / AABB điều chỉnh được; mức "phiêu" (0–100%) điều khiển độ lạ.
3. **Cùng viết đến hết bài**: nút "Viết tiếp" lặp lại quy trình cho từng đoạn; nút "Tự hoàn thiện đến hết bài" điền toàn bộ số ô nhịp còn lại theo cấu trúc.
4. **Gợi ý hợp âm từ melody** (harmonize) và **gợi ý melody từ hợp âm**; thư viện tiến trình hợp âm phổ biến (ballad Việt: I–vi–IV–V, vi–IV–I–V, I–V–vi–IV…).
5. Dùng bộ sinh số ngẫu nhiên có seed để "Tạo lại" có kiểm soát.

### 4.2 Công cụ sáng tác (làm đến đâu nghe đến đó)
- **Piano roll**: vẽ / chọn / xoá, kéo di chuyển, kéo cạnh đổi độ dài, chọn nhiều (kéo vùng, Ctrl+A), copy/paste/duplicate, nhân đôi đoạn, snap 1/4–1/16, zoom ngang/dọc, chỉnh velocity, quantize, dịch cung (transpose), tô sáng nốt thuộc âm giai, bàn phím piano bên trái bấm nghe thử.
- **Làn hợp âm**: bảng hợp âm theo giọng (diatonic + mượn phổ biến + 7th/sus), click ô nhịp để đặt, kéo đổi độ dài, đổi tên/loại, nghe thử.
- **Làn lời bài hát** theo ô nhịp, có **đếm âm tiết tiếng Việt** (mỗi tiếng = 1 âm tiết) so với số nốt trong ô để căn lời–nhạc; bảng lời toàn bài; gắn nhãn đoạn (Intro/Verse/Chorus/Bridge/Outro).
- **Phát nhạc**: play/pause/stop, playhead chạy mượt, phát từ vị trí chọn, lặp vùng, metronome, tempo, tắt/bật từng track (melody, hợp âm, trống nhẹ), chọn âm sắc (piano, pad, pluck, sáo/lead), âm lượng.
- Undo/redo (Ctrl+Z / Ctrl+Y), phím tắt đầy đủ, hiển thị trợ giúp phím tắt.

### 4.3 MIDI keyboard
- Nút **Kết nối MIDI**: liệt kê thiết bị vào, chọn thiết bị, trạng thái kết nối, tự nhận khi cắm/rút.
- **Chơi trực tiếp**: nốt vào phát bằng synth của app (có sustain pedal CC64, velocity).
- **Thu âm**: đếm nhịp vào (1 ô), metronome, ghi nốt vào piano roll theo thời gian thực, tuỳ chọn quantize khi thu; thu được cả khi không có MIDI bằng bàn phím máy tính (hàng A–L, W–P).
- **Nhập từng nốt (step input)**: mỗi nốt bấm được đặt tại con trỏ với độ dài đang chọn rồi tiến con trỏ.
- **Nhận diện hợp âm live** từ các phím đang giữ; nút "Thêm vào làn hợp âm".
- Chế độ **"Đàn gợi ý"**: người dùng đàn vài nốt → kích hoạt 4.1.1.

### 4.4 Lưu & chia sẻ
Dự án, tải/nhập JSON, xuất MIDI, xuất bản chép, bài demo mẫu để thử ngay.

## 5. Giao diện (premium, hợp người làm nghệ thuật)
- Nền **gradient** sâu (tím–chàm–xanh ngọc) chuyển động rất chậm; các lớp kính mờ (glassmorphism) có viền sáng.
- Nút **nổi khối**: gradient, bóng đổ nhiều lớp, highlight cạnh trên, nhấn xuống khi click, **hiệu ứng ánh sáng quét ngang** khi hover. Chữ tiêu đề dùng gradient + shimmer.
- Chuyển động mượt (ease), nốt mới "bật" vào, playhead phát sáng, thanh đo âm lượng nhảy theo nhạc, phím piano sáng khi có nốt.
- Phông Be Vietnam Pro (fallback system-ui), bố cục: thanh trên (tên bài, key, tempo, transport, MIDI) · trái (bảng hợp âm/tiến trình) · giữa (piano roll + làn hợp âm + làn lời) · phải (Trợ lý đồng sáng tác, phương án melody, lời).
- Responsive (tablet trở lên là chính, điện thoại vẫn dùng được), tôn trọng `prefers-reduced-motion`, focus rõ, tương phản đạt AA.

## 6. Cấu trúc file
```
index.html · css/style.css
js/theory.js    (âm giai, hợp âm, nhận diện, âm tiết VN, đoán giọng)
js/store.js     (state, undo/redo, tự lưu)
js/uistate.js   (trạng thái giao diện dùng chung)
js/generator.js (phân tích motif, sinh melody, harmonize)
js/midifile.js  (xuất .mid + bản chép .txt)
js/audio.js     (synth + reverb + trống + metronome + transport lookahead)
js/input.js     (Web MIDI, bàn phím máy tính, thu âm, nhập từng nốt)
js/roll.js      (piano roll + làn hợp âm + làn lời, canvas)
js/ui.js        (toolbar, trợ lý, lời, MIDI, phím tắt)
js/main.js      (bài mẫu + khởi động)
tests/logic.test.js (Node)
```

## 7. Tiêu chí nghiệm thu
1. Mở trang → thấy bài demo, bấm Play nghe được trong ≤2 giây.
2. Gõ motif 1 ô → bấm "Hoàn thiện" → có 3 phương án nghe thử khác nhau, chọn xong melody liền mạch, câu cuối kết ở chủ âm.
3. Mọi nốt sinh ra nằm trong âm giai, quãng nhảy > 1 quãng tám không xảy ra, tổng độ dài khớp số ô nhịp.
4. Cắm MIDI keyboard → đàn ra tiếng; nhấn Thu → nốt xuất hiện đúng vị trí; step input hoạt động; hợp âm giữ phím được nhận đúng (C, Am, G7, Fmaj7, Dsus4…).
5. Undo/redo đúng ở mọi thao tác; tải lại trang không mất dữ liệu; xuất `.mid` mở được trong DAW.
6. Không lỗi console; test Node trong `tests/` đều qua.

## 8. Cách làm việc
Làm theo mốc: (1) lõi lý thuyết + store + audio → (2) piano roll + hợp âm + lời → (3) bộ sinh melody → (4) MIDI → (5) giao diện/animation → (6) test + README. Sau mỗi mốc phải chạy được. Trả lời tiếng Việt, ngắn gọn.
