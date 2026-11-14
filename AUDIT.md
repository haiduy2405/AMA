# AUDIT — Assistant Music AI v1 (trước nâng cấp)

Phương pháp: đọc toàn bộ code · `node tests/logic.test.js` (27.816 kiểm tra, xanh) · Chrome headless ở 3 khung (1600×900, 820×1180 cảm ứng, 390×844 cảm ứng) · ảnh chụp từ điện thoại thật của người dùng (GitHub Pages).

## Điểm số v1 (0–10)
| Hạng mục | Điểm | Ghi chú |
|---|---|---|
| UX desktop | 8 | Bố cục rõ, thao tác đủ, render 0,28 ms/khung |
| **UX di động** | **3** | Xem bảng P0 |
| Chất lượng âm thanh | 5 | 1 kiểu đệm duy nhất, không bass, trống sơ sài, không xuất được audio |
| Chất lượng melody | 6 | Đúng âm giai/kết câu nhưng chưa có "phong cách", chưa biết lời |
| Tính năng vs đối thủ | 5 | Thiếu: nhập MIDI, xuất audio, nhiều dự án, chia sẻ, cấu trúc bài |
| Độ tin cậy dữ liệu | 4 | Chỉ 1 bài trong localStorage; "Mới" đè bài (chỉ cứu bằng Undo) |
| Hiệu năng | 8 | Không rò rỉ; draw 0,28 ms |
| Truy cập (a11y) | 5 | Canvas không có mô tả, nhiều nút <36 px |
| Khả năng thương mại | 4 | Chưa PWA, chưa onboarding, chưa có điểm khác biệt rõ |

## Phát hiện
### P0 — chặn người dùng
| # | Bằng chứng | Tác động | Cách sửa |
|---|---|---|---|
| 1 | Điện thoại: piano roll chỉ chiếm **39%** chiều cao (đo `rollPct`), thanh trên + thanh công cụ ăn ~440 px | Khó thao tác, như app desktop thu nhỏ | Bố cục compact: thanh trên 1 hàng, thanh điều hướng dưới, panel dạng ngăn kéo |
| 2 | `touch-action: none` trên canvas, chỉ có chuột/con trỏ đơn | Không cuộn/zoom bằng cảm ứng; vẽ nốt chặn cuộn | Cảm ứng: chạm = thêm nốt, kéo ô trống = cuộn, 2 ngón = cuộn + zoom |
| 3 | Viewport layout 504 px khi màn 390 px (`scrollWidth` > `innerWidth`) | Trang bị tràn ngang, trình duyệt thu nhỏ | Chặn tràn ngang, `min-width:0`, thanh công cụ cuộn ngang |
| 4 | 67 phần tử tương tác nhỏ hơn 36 px | Bấm sai trên cảm ứng | `pointer:coarse` ⇒ vùng bấm ≥40 px, mép đổi độ dài rộng hơn |
| 5 | "Mới"/"Mở"/"Bài mẫu" thay bài hiện tại; chỉ lưu 1 bài | Dễ mất tác phẩm | Thư viện nhiều dự án + di chuyển dữ liệu v1 |

### P1 — giá trị thương mại
| # | Phát hiện | Cách sửa |
|---|---|---|
| 6 | Chỉ phát được trong app, không xuất âm thanh để gửi người khác | Xuất WAV (render offline) + chia sẻ link |
| 7 | Một kiểu đệm duy nhất; không bass; trống chỉ bật/tắt | Phong cách Ballad/Pop/Bolero/Acoustic, bass, mixer đủ kênh, humanize |
| 8 | Lời và melody độc lập; không biết dấu thanh tiếng Việt | Kiểm tra lệch dấu, Lời→Melody, gieo vần (điểm khác biệt chính) |
| 9 | Không nhập được `.mid` (người dùng có keyboard Yamaha tạo sẵn ý tưởng) | Nhập `.mid` |
| 10 | Không có khái niệm cấu trúc bài; không sao chép đoạn | Mẫu khung bài + sao chép đoạn (nốt, hợp âm, lời) |
| 11 | Không có bản in hợp âm-trên-lời — định dạng nhạc sĩ Việt hay dùng | In bản chép (PDF qua trình duyệt) |
| 12 | Không cài được như app, không chạy offline, không hướng dẫn lần đầu | PWA + onboarding |
| 13 | Chỉ sinh đoạn mới; không "biến tấu" phần đã viết | Nút Biến tấu cho vùng chọn |

### P2 — chất lượng
| # | Phát hiện | Ghi chú |
|---|---|---|
| 14 | Tên thiết bị MIDI chèn vào `innerHTML` | Dữ liệu từ hệ thống, rủi ro thấp nhưng nên escape |
| 15 | Canvas piano roll không có mô tả cho trình đọc màn hình | Thêm `aria-label` + vùng mô tả trạng thái |
| 16 | Một track melody duy nhất, chưa có bè | Để v3 |
| 17 | Chưa có MP3 / chưa nhập audio | Để v3 (WAV đã đủ chia sẻ) |

## Kế hoạch & trạng thái
(cập nhật ở cuối quá trình — xem mục "Kết quả v2")
