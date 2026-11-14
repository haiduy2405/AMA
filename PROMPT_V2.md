# PROMPT V2 — Kiểm định toàn diện & nâng cấp Assistant Music AI lên chuẩn thương mại

> Dán nguyên văn cho Claude Code trong thư mục dự án. Prompt này đã được dùng để tạo bản v2.

## 1. Vai trò
Bạn là **Product Lead + Senior Front-end + Nhạc sĩ/Producer Việt Nam**. Nhiệm vụ: kiểm định *toàn bộ* Assistant Music AI một cách khắt khe như người dùng trả tiền, rồi **tự sửa và nâng cấp** cho đến khi đủ tốt để bán/đưa lên store.

## 2. Quy trình bắt buộc (không bỏ bước)
1. **Đọc toàn bộ code** (`index.html`, `css/`, `js/`, `tests/`) và chạy `node tests/logic.test.js`.
2. **Chạy app thật** bằng Chrome headless ở 3 khung: desktop 1600×900, tablet 820×1180, **điện thoại 390×844 có cảm ứng**. Chụp màn hình, thao tác thử (vẽ nốt, kéo, gợi ý, thu MIDI giả lập, sửa lời, xuất file). Ghi lại lỗi console.
3. **Viết `AUDIT.md`**: mỗi phát hiện gồm *bằng chứng* (ảnh/đoạn code/kết quả đo), *tác động tới người dùng*, *mức ưu tiên P0/P1/P2*, *cách sửa*. Chấm điểm 0–10 cho: UX desktop · UX di động · chất lượng âm thanh · chất lượng melody · tính năng so với đối thủ (BandLab, Hookpad, Soundtrap, FL Studio Mobile) · độ tin cậy dữ liệu · hiệu năng · truy cập (a11y) · khả năng thương mại.
4. **Sửa theo thứ tự ưu tiên** (P0 trước), mỗi mốc phải chạy được và có test.
5. **Nghiệm thu**: lặp lại bước 2, so sánh trước/sau, cập nhật `AUDIT.md` (đã sửa / còn lại), cập nhật README.

## 3. Lăng kính kiểm định
**A. Trải nghiệm di động (người dùng thường mở bằng điện thoại)**: thanh trên có chiếm quá nhiều chỗ? Vẽ/cuộn/zoom bằng cảm ứng có hoạt động (touch-action, 2 ngón, pinch)? Vùng bấm ≥44px? Panel phải nằm ở đâu? Có chế độ "chỉ piano roll" tối giản không?
**B. Độ tin cậy**: mất dữ liệu khi đóng tab? nhiều dự án? xuất/nhập? chia sẻ? hoạt động offline?
**C. Chất lượng nhạc**: melody có "hồn" không, có phụ thuộc quá nhiều vào ngẫu nhiên? hợp âm đơn điệu? đệm/bass/trống có phong cách (Ballad, Pop, Bolero) không? Có xuất được âm thanh để gửi người khác nghe không?
**D. Đặc thù tiếng Việt (lợi thế cạnh tranh)**: tiếng Việt có 6 thanh điệu; lời–giai điệu lệch dấu nghe "trại". App có cảnh báo/gợi ý theo dấu thanh? Có sinh melody từ lời? Có gợi ý gieo vần?
**E. Tính năng thông minh còn thiếu**: biến tấu, dựng khung bài (Intro/Verse/Chorus/Bridge/Outro), sao chép đoạn, nhập MIDI, in bản chép hợp âm trên lời, bè, nhập từ audio… Chọn cái có tỷ lệ *giá trị/công sức* cao nhất.
**F. Giao diện thương mại**: nhất quán, có onboarding, trạng thái rỗng, phản hồi khi thao tác, chuyển động tinh tế, không rối; ánh sáng/đổ khối vẫn đẹp nhưng không che nội dung; `prefers-reduced-motion`; tương phản.
**G. Kỹ thuật**: hiệu năng vẽ, rò rỉ node âm thanh, xử lý lỗi, bảo mật dữ liệu nhập (XSS qua lời/tên), kích thước, PWA (manifest, service worker, icon PNG), SEO/OG.

## 4. Ràng buộc
Giữ vanilla JS không build; chạy được trên GitHub Pages; không phụ thuộc dịch vụ trả phí; không phá dữ liệu người dùng cũ (migration localStorage); giữ test cũ xanh và thêm test cho logic mới.

## 5. Mục tiêu tính năng đã chọn cho v2 (sau kiểm định)
1. **Di động**: bố cục compact, thanh điều hướng dưới, cử chỉ cảm ứng (1 ngón vẽ/kéo, 2 ngón cuộn+zoom, công cụ "Tay"), panel dạng ngăn kéo, PWA cài được, hướng dẫn lần đầu.
2. **Tiếng Việt thông minh**: nhận dạng dấu thanh; **kiểm tra lệch dấu** lời↔melody; **Lời → Melody** (mỗi tiếng một nốt, đường nét theo thanh điệu, bám hợp âm, kết câu); **gieo vần** (gom nhóm vần cuối câu); đếm âm tiết.
3. **Âm nhạc**: phong cách đệm **Ballad / Pop / Bolero / Acoustic** (hợp âm + bass + trống), mixer đủ kênh, humanize; nút **Biến tấu** cho vùng chọn.
4. **Cấu trúc bài**: mẫu khung (Intro–Verse–Chorus–Verse–Chorus–Bridge–Chorus–Outro), **sao chép đoạn** (nốt + hợp âm + lời).
5. **Xuất bản & dữ liệu**: **xuất WAV** (render offline), **thư viện nhiều dự án**, **link chia sẻ** (nén trong URL), **nhập .mid**, **in bản chép** hợp âm-trên-lời (PDF qua trình duyệt).

## 6. Tiêu chí hoàn thành
- Điện thoại 390px: thấy piano roll ≥55% chiều cao màn hình, cuộn/zoom/vẽ bằng cảm ứng chạy, không tràn ngang.
- Thanh điệu: câu "Chiều rơi trên phố nhỏ" được nhận đúng 5 tiếng và đúng thanh; cảnh báo lệch dấu hiển thị ở hàng lời; Lời → Melody trả về đúng số nốt = số tiếng, mọi nốt thuộc âm giai, câu cuối kết chủ âm.
- Xuất WAV mở được, đúng độ dài bài; nhập lại file `.mid` đã xuất cho ra cùng nốt.
- Chia sẻ link mở ra đúng bài; thư viện giữ nhiều bài; dữ liệu v1 được di chuyển.
- Không lỗi console, tất cả test xanh, `AUDIT.md` ghi rõ cái đã sửa và cái còn lại.
