/**
 * Template (khác layout) được dựng lại mỗi lần điều hướng, nên nội dung trang
 * mới luôn có một nhịp fade nhẹ thay vì thay khung đột ngột.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
