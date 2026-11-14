# PROMPT — Phân tích, tối ưu, nâng cấp màn hình "Có phiên bản mới" (cập nhật bắt buộc)

**Bối cảnh:** webapp PWA vanilla JS "Assistant Music AI" (không build, GitHub Pages, SW precache). Khi `version.json` trên mạng khác bản đang chạy, `js/app.js` hiện màn chắn `#updateGate` (HTML ở `index.html`, CSS `.gate*` ở `css/style.css`, service worker `sw.js`, phát hành bằng `node tools/bump.js`).
**Triệu chứng thật trên Android (ảnh chụp):** màn hiện "Có phiên bản mới — Đang tải bản mới…", nút xám, **không có tiến trình, không biết bao giờ xong**, có thể kẹt vô hạn; thanh trạng thái phía trên đen lệch nền; thẻ trơ trọi, không nói bản mới có gì.

## Yêu cầu (làm theo thứ tự, mỗi bước kiểm chứng)
1. **Phân tích nguyên nhân kẹt** trong `apply()` (app.js) và `install` (sw.js): precache tuần tự `cache:'no-store'` trên mạng chậm; một file lỗi làm SW `redundant` nên không bao giờ `activated`; timeout 20 s rồi reload vẫn ra bản cũ → vòng lặp.
2. **Độ tin cậy (ưu tiên số 1):**
   - Tải song song có giới hạn (≈6), file lõi (html/css/js/icon) bắt buộc; font + ảnh là tuỳ chọn, lỗi thì bỏ qua, không làm hỏng cả bản cài.
   - Có tín hiệu tiến trình từ SW → trang (BroadcastChannel), hiện thanh % + "đã tải n/N".
   - Có **đường lui tự động**: SW redundant / quá 30 s → huỷ đăng ký SW, xoá cache `muse-*`, nạp lại với tham số bypass cache. Luôn có nút **Thử lại** và **Tải lại hoàn toàn**.
   - Không bao giờ mất bài đang soạn (đã `saveNow` trước khi hiện).
3. **Giao diện:** hiển thị `0.2.1 → 0.2.2`, tiêu đề + 3–4 ý chính của bản mới (lấy từ `version.json`), ảnh bìa `assets/hero.webp` có fallback gradient, thanh tiến trình, trạng thái rõ ("Đang tải…", "Đang cài…", "Xong, khởi động lại…", "Có lỗi — thử lại"). Thiết kế mobile-first, đủ safe-area (iOS/Android), nút ≥48 px, chữ ≥16 px, tôn trọng `prefers-reduced-motion`, không nháy, tương phản đạt WCAG AA, `aria-live` cho trạng thái.
4. **Tối ưu nền:** nền `html/body` trùng màu theme để không có dải đen; không animation filter/background-position.
5. **Kiểm thử:** Playwright (Chrome giả lập iPhone 13 + Pixel 7 + desktop): giả lập bản mới (đổi `version.json`), mạng chậm, một file 404, SW lỗi → màn không bao giờ kẹt quá ~35 s và luôn có lối thoát; không lỗi console; `tests/logic.test.js` vẫn pass.
6. **Phát hành:** thêm mục changelog, `node tools/bump.js patch`, commit (kèm trailer), `git push origin HEAD:main`, `git pull` trong `D:\MusicAi`.

**Ràng buộc:** vanilla, không thư viện, không build; giữ tên `ASSETS` trong sw.js (bump.js đọc); tiếng Việt; thành thật nói rõ phần chưa thử trên máy thật.
