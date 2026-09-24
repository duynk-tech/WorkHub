'use client';

import React, { useState } from 'react';
import { Input, Field, Textarea } from '@/components/ui';
import { useCurrentUser } from '@/components/layout/current-user';
import {
  PrintDocumentModal,
  DocumentPartyBoxes,
  PRINT_SIGNATURE_CLASS,
} from '@/components/domain/print-document-modal';
import { getEquipmentSpecRows } from '@/lib/equipment-specs';
import { EquipmentSpecGrid } from '@/components/domain/equipment-spec-grid';

interface EquipmentHandoverModalProps {
  open: boolean;
  onClose: () => void;
  equipment: any;
  companyInfo?: {
    name?: string;
    shortName?: string;
    address?: string;
    phone?: string;
  };
}

export function EquipmentHandoverModal({
  open,
  onClose,
  equipment,
  companyInfo,
}: EquipmentHandoverModalProps) {
  if (!equipment) return null;

  const me = useCurrentUser();

  const todayStr = new Date().toISOString().slice(0, 10);
  // Mã máy dạng EQ-2026-0005 → chỉ lấy phần số cuối để số biên bản không lặp năm
  const machineSeq = equipment.machineCode?.split('-').pop() || String(equipment.id).padStart(4, '0');
  const defaultDocNo = `BBBG-${new Date().getFullYear()}-${machineSeq}`;

  const [templateType, setTemplateType] = useState<'HANDOVER' | 'DELIVERY'>('HANDOVER');

  // Document meta
  const [docNumber, setDocNumber] = useState(defaultDocNo);
  const [docDate, setDocDate] = useState(todayStr);
  const [contractNo, setContractNo] = useState('');

  // Party A (Giao) - Đọc từ cấu hình công ty
  const [delivererCompany, setDelivererCompany] = useState(
    companyInfo?.name || 'Công ty Sunny'
  );
  const [delivererRepresentative, setDelivererRepresentative] = useState(me?.fullName || '');
  const [delivererTitle, setDelivererTitle] = useState(
    me?.positionName || 'Kỹ thuật viên trưởng'
  );
  /** Kỹ thuật viên lắp đặt – mặc định là người đang đăng nhập hệ thống */
  const [technicianName, setTechnicianName] = useState(me?.fullName || '');
  const [delivererPhone, setDelivererPhone] = useState(companyInfo?.phone || '');
  const [delivererAddress, setDelivererAddress] = useState(
    companyInfo?.address || '167-169 Calmette, P. Nguyễn Thái Bình, Quận 1, TP.HCM'
  );

  React.useEffect(() => {
    if (me?.fullName) {
      setTechnicianName((prev) => prev || me.fullName);
      setDelivererRepresentative((prev) => prev || me.fullName);
      if (me.positionName) {
        setDelivererTitle((prev) => (prev === 'Kỹ thuật viên trưởng' ? me.positionName! : prev));
      }
    }
  }, [me]);

  React.useEffect(() => {
    if (companyInfo?.name) setDelivererCompany(companyInfo.name);
    if (companyInfo?.phone) setDelivererPhone(companyInfo.phone);
    if (companyInfo?.address) setDelivererAddress(companyInfo.address);
  }, [companyInfo]);

  // Party B (Nhận)
  const [receiverCompany, setReceiverCompany] = useState(equipment.customer?.name || 'Khách hàng F&B');
  const [receiverRepresentative, setReceiverRepresentative] = useState(
    equipment.location?.managerName || equipment.customer?.contactName || ''
  );
  const [receiverTitle, setReceiverTitle] = useState('Quản lý cửa hàng');
  const [receiverPhone, setReceiverPhone] = useState(
    equipment.location?.phone || equipment.customer?.phone || ''
  );
  const [locationName, setLocationName] = useState(equipment.location?.name || 'Điểm bán');
  const [locationAddress, setLocationAddress] = useState(
    equipment.location?.address || equipment.customer?.address || 'Chi nhánh khách hàng'
  );

  // Technical state & Accessories
  const [equipmentCondition, setEquipmentCondition] = useState(
    'Mới 100%, nguyên đai nguyên kiện, đã lắp đặt hoàn thiện, hệ thống làm lạnh đạt chuẩn, máy vận hành êm ái.'
  );

  const defaultAccessories = [
    'Dây nguồn & phích cắm công nghiệp an toàn (01 bộ)',
    'Ống cấp nước, ống xả & bộ cút nối inox (01 bộ)',
    'Khay hứng nước thừa inox 304 cao cấp (01 chiếc)',
    'Cối đánh / bồn chứa & trục khuấy chuyên dụng (01 bộ)',
    'Bộ gioăng cao su thực phẩm & tuýp mỡ bôi trơn an toàn NSF (01 bộ)',
    'Sách Hướng dẫn vận hành & Sổ bảo hành chính hãng (01 cuốn)',
  ];
  const [accessoriesText, setAccessoriesText] = useState(defaultAccessories.join('\n'));

  // Warranty
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [notes, setNotes] = useState(equipment.notes || 'Thiết bị được lắp đặt và chạy thử nghiệm thu đạt chuẩn.');

  React.useEffect(() => {
    if (!equipment) return;
    const seq = equipment.machineCode?.split('-').pop() || String(equipment.id).padStart(4, '0');
    setDocNumber(`BBBG-${new Date().getFullYear()}-${seq}`);
    setReceiverCompany(equipment.customer?.name || 'Khách hàng F&B');
    setReceiverRepresentative(
      equipment.location?.managerName || equipment.customer?.contactName || ''
    );
    setReceiverPhone(equipment.location?.phone || equipment.customer?.phone || '');
    setLocationName(equipment.location?.name || 'Điểm bán');
    setLocationAddress(
      equipment.location?.address || equipment.customer?.address || 'Chi nhánh khách hàng'
    );
    if (equipment.customerOrder?.orderCode) {
      setContractNo(equipment.customerOrder.orderCode);
    }
    if (equipment.notes) {
      setNotes(equipment.notes);
    }
    if (equipment.installedDate && equipment.warrantyExpiresAt) {
      const start = new Date(equipment.installedDate).getTime();
      const end = new Date(equipment.warrantyExpiresAt).getTime();
      const months = Math.round((end - start) / (30.4375 * 24 * 3600 * 1000));
      if (months > 0) {
        setWarrantyMonths(String(months));
      }
    }
  }, [equipment]);

  const specRows = getEquipmentSpecRows(equipment);

  const parsedDate = new Date(docDate);
  const day = parsedDate.getDate();
  const month = parsedDate.getMonth() + 1;
  const year = parsedDate.getFullYear();

  const accessoriesList = accessoriesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <PrintDocumentModal
      open={open}
      onClose={onClose}
      title="In biên bản bàn giao thiết bị"
      description="Biên bản giao nhận và nghiệm thu kỹ thuật thiết bị"
      editForm={
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Mẫu biểu văn bản">
                <select
                  className="select"
                  value={templateType}
                  onChange={(e) => setTemplateType(e.target.value as any)}
                >
                  <option value="HANDOVER">Biên bản bàn giao & nghiệm thu thiết bị (mẫu đầy đủ)</option>
                  <option value="DELIVERY">Phiếu giao nhận thiết bị (mẫu rút gọn)</option>
                </select>
              </Field>
            </div>

            <div style={{ flex: 1 }}>
              <Field label="Số biên bản / Số phiếu">
                <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
              </Field>
            </div>

            <div style={{ flex: 1 }}>
              <Field label="Ngày lập biên bản">
                <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </Field>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Party A */}
            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-subtle)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-strong)' }}>
                BÊN GIAO (BÊN A)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="Tên đơn vị / Công ty">
                  <Input value={delivererCompany} onChange={(e) => setDelivererCompany(e.target.value)} />
                </Field>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Người đại diện giao">
                      <Input value={delivererRepresentative} onChange={(e) => setDelivererRepresentative(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Chức vụ">
                      <Input value={delivererTitle} onChange={(e) => setDelivererTitle(e.target.value)} />
                    </Field>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Kỹ thuật viên lắp đặt (ký biên bản)">
                      <Input value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Số điện thoại liên hệ">
                      <Input value={delivererPhone} onChange={(e) => setDelivererPhone(e.target.value)} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {/* Party B */}
            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-subtle)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-strong)' }}>
                BÊN NHẬN (BÊN B) - KHÁCH HÀNG
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="Tên khách hàng / Đơn vị">
                  <Input value={receiverCompany} onChange={(e) => setReceiverCompany(e.target.value)} />
                </Field>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Người đại diện nhận">
                      <Input value={receiverRepresentative} onChange={(e) => setReceiverRepresentative(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Chức vụ">
                      <Input value={receiverTitle} onChange={(e) => setReceiverTitle(e.target.value)} />
                    </Field>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Chi nhánh / Điểm lắp đặt">
                      <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Số điện thoại">
                      <Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Field label="Địa chỉ điểm lắp đặt / Giao máy">
            <Input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} />
          </Field>

          <Field label="Tình trạng kỹ thuật khi bàn giao">
            <Input value={equipmentCondition} onChange={(e) => setEquipmentCondition(e.target.value)} />
          </Field>

          <Field label="Danh mục linh phụ kiện & tài liệu bàn giao kèm theo (mỗi dòng một món)">
            <Textarea
              rows={4}
              value={accessoriesText}
              onChange={(e) => setAccessoriesText(e.target.value)}
            />
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 180 }}>
              <Field label="Thời hạn bảo hành (tháng)">
                <Input value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Căn cứ Hợp đồng / Đơn hàng số">
                <Input
                  placeholder="Ví dụ: HĐ-2026/FNB-01 hoặc ORD-2026-0001"
                  value={contractNo}
                  onChange={(e) => setContractNo(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text-strong)' }}>
              ⚙️ Thông số kỹ thuật thiết bị (in kèm trên biên bản)
            </div>
            {specRows.length > 0 ? (
              <EquipmentSpecGrid rows={specRows} />
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Chưa có thông số chi tiết trong hồ sơ máy. Có thể ghi chú thêm ở mục dưới.
              </div>
            )}
          </div>

          <Field label="Ghi chú thêm">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      }
    >
            {/* 1. Quốc hiệu & Tiêu ngữ hoặc Header công ty */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #000', paddingBottom: 8, marginBottom: 12 }}>
              <div style={{ maxWidth: '52%' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#0f172a' }}>
                  {delivererCompany}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>
                  {delivererAddress}
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  Hotline kỹ thuật: <strong>{delivererPhone}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'center', minWidth: '40%' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, marginTop: 1 }}>
                  Độc lập - Tự do - Hạnh phúc
                </div>
                <div style={{ fontSize: '11px', letterSpacing: '1px', marginTop: 1 }}>
                  - - - - - - - - - o 0 o - - - - - - - - -
                </div>
              </div>
            </div>

            {/* 2. Tiêu đề văn bản */}
            <div style={{ textAlign: 'center', margin: '20px 0 16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {templateType === 'HANDOVER' ? 'BIÊN BẢN BÀN GIAO VÀ NGHIỆM THU THIẾT BỊ' : 'PHIẾU GIAO NHẬN THIẾT BỊ & PHỤ KIỆN'}
              </div>
              <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: 4, color: '#334155' }}>
                Số: <strong>{docNumber}</strong> {contractNo ? `• Căn cứ HĐ/Đơn hàng: ${contractNo}` : ''}
              </div>
              <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: 2, color: '#475569' }}>
                Hôm nay, ngày {day} tháng {month} năm {year}, tại: {locationName} ({locationAddress})
              </div>
            </div>

            {/* 3. Căn cứ pháp lý / nghiệp vụ */}
            <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 8, color: '#334155' }}>
              Căn cứ vào thỏa thuận cung cấp, lắp đặt và dịch vụ kỹ thuật thiết bị F&B giữa hai bên; Chúng tôi gồm có:
            </div>

            {/* 4. Thông tin các bên */}
            <DocumentPartyBoxes
              leftTitle="BÊN GIAO (BÊN A)"
              left={
                <>
                  <div>Đơn vị: <strong>{delivererCompany}</strong></div>
                  <div>Đại diện: <strong>{delivererRepresentative}</strong></div>
                  <div>Chức vụ: {delivererTitle}</div>
                  <div>Điện thoại: {delivererPhone}</div>
                </>
              }
              rightTitle="BÊN NHẬN (BÊN B)"
              right={
                <>
                  <div>Khách hàng: <strong>{receiverCompany}</strong></div>
                  <div>Đại diện: <strong>{receiverRepresentative}</strong></div>
                  <div>Chức vụ: {receiverTitle}</div>
                  <div>Điểm đặt: <strong>{locationName}</strong> (SĐT: {receiverPhone || '—'})</div>
                </>
              }
            />

            {/* 5. Bảng thông tin thiết bị bàn giao */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                I. Danh mục thiết bị bàn giao:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(241, 245, 249, 0.6)' }}>
                    <th style={{ border: '1px solid #000', padding: '5px 7px', width: '35px', textAlign: 'center' }}>STT</th>
                    <th style={{ border: '1px solid #000', padding: '5px 7px' }}>Tên thiết bị & Thông số kỹ thuật</th>
                    <th style={{ border: '1px solid #000', padding: '5px 7px', width: '130px' }}>Số Serial (S/N)</th>
                    <th style={{ border: '1px solid #000', padding: '5px 7px', width: '45px', textAlign: 'center' }}>SL</th>
                    <th style={{ border: '1px solid #000', padding: '5px 7px', width: '150px' }}>Tình trạng kỹ thuật</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ verticalAlign: 'top' }}>
                    <td style={{ border: '1px solid #000', padding: '6px 7px', textAlign: 'center', fontWeight: 700, verticalAlign: 'top' }}>01</td>
                    <td style={{ border: '1px solid #000', padding: '6px 7px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{equipment.name}</div>
                      {specRows.length > 0 && <EquipmentSpecGrid rows={specRows} />}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 7px', fontFamily: 'monospace', fontWeight: 600, verticalAlign: 'top' }}>
                      {equipment.serialNumber}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 7px', textAlign: 'center', fontWeight: 700, verticalAlign: 'top' }}>01</td>
                    <td style={{ border: '1px solid #000', padding: '6px 7px', fontSize: '11.5px', verticalAlign: 'top' }}>
                      {equipmentCondition}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 6. Danh mục phụ kiện bàn giao kèm theo */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                II. Linh phụ kiện & Tài liệu bàn giao kèm theo:
              </div>
              <div style={{ border: '1px solid #000', padding: '8px 14px', fontSize: '12px', background: 'rgba(250, 250, 250, 0.55)', backdropFilter: 'blur(1.5px)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {Array.from({ length: Math.ceil(accessoriesList.length / 2) }, (_, row) => (
                      <tr key={row}>
                        {[accessoriesList[row * 2], accessoriesList[row * 2 + 1]].map((acc, col) => (
                          <td key={col} style={{ width: '50%', verticalAlign: 'top', padding: '1px 8px 1px 0' }}>
                            {acc ? `☑ ${acc}` : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 7. Nội dung nghiệm thu, đào tạo & chuyển giao */}
            <div style={{ marginBottom: 10, fontSize: '12.5px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                III. Nội dung nghiệm thu & Hướng dẫn vận hành:
              </div>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <li>Kỹ thuật viên Bên A đã tiến hành lắp đặt, cân chỉnh thông số, kết nối nguồn điện/nước và chạy thử nghiệm thu thiết bị đạt chuẩn kỹ thuật nhà sản xuất.</li>
                <li>Bên A đã hướng dẫn trực tiếp cho nhân sự Bên B quy trình vận hành, vệ sinh tiệt trùng hằng ngày và các quy định an toàn điện/nhiệt.</li>
                <li>Bên B đã kiểm tra ngoại quan, chạy thử máy và xác nhận tiếp nhận đầy đủ thiết bị, linh phụ kiện đúng số lượng và chủng loại.</li>
              </ul>
            </div>

            {/* 8. Cam kết bảo hành & Hỗ trợ kỹ thuật */}
            <div style={{ marginBottom: 10, fontSize: '12.5px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                IV. Điều khoản bảo hành & Hỗ trợ kỹ thuật:
              </div>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <li>Thiết bị được bảo hành chính hãng trong thời hạn <strong>{warrantyMonths} tháng</strong> kể từ ngày ký biên bản bàn giao.</li>
                <li>Khi phát sinh sự cố kỹ thuật, Bên B liên hệ Hotline <strong>{delivererPhone}</strong> hoặc mở Zalo quét mã QR trên thân máy để gửi phiếu báo hỏng khẩn cấp (Cam kết SLA phản hồi kỹ thuật trong vòng 2 giờ).</li>
              </ul>
            </div>

            {notes && (
              <div style={{ marginBottom: 10, fontSize: '12px', color: '#334155' }}>
                <strong>* Ghi chú bổ sung:</strong> {notes}
              </div>
            )}

            {/* 9. Đại diện các bên ký nhận */}
            <div className={PRINT_SIGNATURE_CLASS} style={{ marginTop: 10, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 8 }}>
                Biên bản được lập thành 02 (hai) bản có giá trị pháp lý như nhau, mỗi bên giữ 01 (một) bản để làm căn cứ quản lý, vận hành và thực hiện bảo hành.
              </div>

              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'center',
                  marginTop: 10,
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                }}
              >
                <tbody>
                  <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    {[
                      { title: 'ĐẠI DIỆN BÊN GIAO', hint: '(Ký và ghi rõ họ tên)' },
                      { title: 'KỸ THUẬT VIÊN LẮP ĐẶT', hint: '(Ký và ghi rõ họ tên)' },
                      { title: 'ĐẠI DIỆN BÊN NHẬN', hint: '(Ký, đóng dấu & ghi rõ họ tên)' },
                    ].map((col) => (
                      <td
                        key={col.title}
                        style={{ width: '33.33%', verticalAlign: 'top', padding: '0 6px 40px', textAlign: 'center' }}
                      >
                        <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>{col.title}</div>
                        <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>{col.hint}</div>
                      </td>
                    ))}
                  </tr>
                  <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    {[delivererRepresentative, technicianName, receiverRepresentative].map((name, i) => (
                      <td key={i} style={{ verticalAlign: 'top', padding: '0 6px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px' }}>
                        {name}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
    </PrintDocumentModal>
  );
}