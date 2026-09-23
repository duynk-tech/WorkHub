'use client';

import React, { useState } from 'react';
import { Field, Input, Textarea } from '@/components/ui';
import { useCurrentUser } from '@/components/layout/current-user';
import {
  PrintDocumentModal,
  DocumentLetterhead,
  DocumentPartyBoxes,
  DocumentSignatures,
} from '@/components/domain/print-document-modal';
import { ASSET_CATEGORIES } from '@/server/modules/asset/service';

/**
 * Biên bản bàn giao & thu hồi tài sản văn phòng.
 * Hai mẫu dùng chung một bố cục, chỉ khác chiều giao nhận và phần nội dung xác nhận.
 */

export type AssetDocumentType = 'HANDOVER' | 'RETURN';

const DOC_META: Record<AssetDocumentType, { title: string; heading: string; codePrefix: string }> = {
  HANDOVER: {
    title: 'In biên bản bàn giao tài sản',
    heading: 'BIÊN BẢN BÀN GIAO TÀI SẢN',
    codePrefix: 'BBBG-TS',
  },
  RETURN: {
    title: 'In biên bản thu hồi tài sản',
    heading: 'BIÊN BẢN THU HỒI TÀI SẢN',
    codePrefix: 'BBTH-TS',
  },
};

export function AssetDocumentModal({
  open,
  onClose,
  asset,
  docType = 'HANDOVER',
  companyInfo,
}: {
  open: boolean;
  onClose: () => void;
  asset: any;
  docType?: AssetDocumentType;
  companyInfo?: { name?: string; address?: string; phone?: string; taxCode?: string };
}) {
  const me = useCurrentUser();
  const meta = DOC_META[docType];

  const todayStr = new Date().toISOString().slice(0, 10);
  // Mã tài sản dạng AST-2026-0001 → chỉ lấy phần số cuối để không lặp lại năm
  const assetSeq = asset?.assetCode?.split('-').pop() || String(asset?.id ?? '').padStart(4, '0');
  const defaultDocNo = `${meta.codePrefix}-${new Date().getFullYear()}-${assetSeq}`;

  const [docNumber, setDocNumber] = useState(defaultDocNo);
  const [docDate, setDocDate] = useState(todayStr);

  // Bên quản lý tài sản (phòng Hành chính / IT)
  const [companyName, setCompanyName] = useState(companyInfo?.name || 'Công ty Sunny');
  const [companyAddress, setCompanyAddress] = useState(companyInfo?.address || '');
  const [companyPhone, setCompanyPhone] = useState(companyInfo?.phone || '');
  const [managerName, setManagerName] = useState(me?.fullName || '');
  const [managerTitle, setManagerTitle] = useState(me?.positionName || 'Phụ trách quản lý tài sản');

  // Nhân sự sử dụng tài sản
  const [employeeName, setEmployeeName] = useState(asset?.currentAssignee?.fullName || '');
  const [employeeCode, setEmployeeCode] = useState(asset?.currentAssignee?.code || '');
  const [employeeTitle, setEmployeeTitle] = useState(asset?.currentAssignee?.position?.name || '');
  const [departmentName, setDepartmentName] = useState(
    asset?.currentDepartment?.name || asset?.currentAssignee?.department?.name || '',
  );

  const [assetCondition, setAssetCondition] = useState(
    docType === 'HANDOVER'
      ? 'Thiết bị hoạt động bình thường, đầy đủ phụ kiện, không trầy xước đáng kể.'
      : 'Thiết bị hoạt động bình thường, đã được kiểm tra và vệ sinh trước khi nhập kho.',
  );
  const [accessoriesText, setAccessoriesText] = useState(
    ['Bộ sạc & dây nguồn (01 bộ)', 'Túi chống sốc / hộp đựng (01 chiếc)', 'Chuột không dây (01 chiếc)'].join('\n'),
  );
  const [handoverPurpose, setHandoverPurpose] = useState(
    docType === 'HANDOVER' ? 'Phục vụ công việc chuyên môn tại vị trí đang đảm nhiệm' : 'Bàn giao lại khi thay đổi thiết bị / kết thúc công việc',
  );
  const [notes, setNotes] = useState(asset?.notes || '');

  if (!asset) return null;

  const parsedDate = new Date(docDate);
  const accessoriesList = accessoriesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const categoryName = ASSET_CATEGORIES[asset.category]?.label || 'Tài sản văn phòng';
  const isHandover = docType === 'HANDOVER';
  const cellBorder = '1px solid #000';

  const sectionTitle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    marginBottom: 6,
    textTransform: 'uppercase',
  };

  return (
    <PrintDocumentModal
      open={open}
      onClose={onClose}
      title={meta.title}
      description="Biên bản giao nhận tài sản giữa công ty và người sử dụng"
      editForm={
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Số biên bản">
              <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
            </Field>
            <Field label="Ngày lập biên bản">
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ padding: 12, border: '1px solid var(--border-base)', borderRadius: 8, background: 'var(--surface-sunken)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-strong)' }}>
                {isHandover ? 'BÊN GIAO — CÔNG TY' : 'BÊN NHẬN — CÔNG TY'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="Tên đơn vị">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Người đại diện">
                      <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Chức vụ">
                      <Input value={managerTitle} onChange={(e) => setManagerTitle(e.target.value)} />
                    </Field>
                  </div>
                </div>
                <Field label="Điện thoại liên hệ">
                  <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
                </Field>
              </div>
            </div>

            <div style={{ padding: 12, border: '1px solid var(--border-base)', borderRadius: 8, background: 'var(--surface-sunken)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-strong)' }}>
                {isHandover ? 'BÊN NHẬN — NGƯỜI SỬ DỤNG' : 'BÊN GIAO — NGƯỜI SỬ DỤNG'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Họ và tên">
                      <Input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
                    </Field>
                  </div>
                  <div style={{ width: 120 }}>
                    <Field label="Mã NV">
                      <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
                    </Field>
                  </div>
                </div>
                <Field label="Chức danh">
                  <Input value={employeeTitle} onChange={(e) => setEmployeeTitle(e.target.value)} />
                </Field>
                <Field label="Phòng ban">
                  <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          <Field label={isHandover ? 'Mục đích bàn giao' : 'Lý do thu hồi'}>
            <Input value={handoverPurpose} onChange={(e) => setHandoverPurpose(e.target.value)} />
          </Field>

          <Field label={isHandover ? 'Tình trạng tài sản khi bàn giao' : 'Tình trạng tài sản khi thu hồi'}>
            <Input value={assetCondition} onChange={(e) => setAssetCondition(e.target.value)} />
          </Field>

          <Field label="Phụ kiện kèm theo (mỗi dòng một món)">
            <Textarea rows={4} value={accessoriesText} onChange={(e) => setAccessoriesText(e.target.value)} />
          </Field>

          <Field label="Ghi chú thêm">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      }
    >
      <DocumentLetterhead
        companyName={companyName}
        addressLine={companyAddress || undefined}
        contactLine={companyPhone ? <>Điện thoại: <strong>{companyPhone}</strong></> : undefined}
      />

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: '19px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {meta.heading}
        </div>
        <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginTop: 2 }}>
          Số: <strong>{docNumber}</strong>
        </div>
        <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginTop: 2 }}>
          Hôm nay, ngày {parsedDate.getDate()} tháng {parsedDate.getMonth() + 1} năm {parsedDate.getFullYear()},
          chúng tôi gồm có:
        </div>
      </div>

      <DocumentPartyBoxes
        leftTitle={isHandover ? 'BÊN GIAO (BÊN A)' : 'BÊN NHẬN (BÊN A)'}
        left={
          <>
            <div>
              Đơn vị: <strong>{companyName}</strong>
            </div>
            <div>
              Đại diện: <strong>{managerName}</strong>
            </div>
            <div>Chức vụ: {managerTitle}</div>
            {companyPhone && <div>Điện thoại: {companyPhone}</div>}
          </>
        }
        rightTitle={isHandover ? 'BÊN NHẬN (BÊN B)' : 'BÊN GIAO (BÊN B)'}
        right={
          <>
            <div>
              Họ và tên: <strong>{employeeName}</strong>
              {employeeCode ? ` (${employeeCode})` : ''}
            </div>
            {employeeTitle && <div>Chức danh: {employeeTitle}</div>}
            {departmentName && (
              <div>
                Phòng ban: <strong>{departmentName}</strong>
              </div>
            )}
          </>
        }
      />

      {/* Danh mục tài sản */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionTitle}>
          I. Tài sản {isHandover ? 'bàn giao' : 'thu hồi'}:
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(241, 245, 249, 0.6)' }}>
              <th style={{ border: cellBorder, padding: '5px 7px', width: '35px', textAlign: 'center' }}>STT</th>
              <th style={{ border: cellBorder, padding: '5px 7px' }}>Tên tài sản & cấu hình</th>
              <th style={{ border: cellBorder, padding: '5px 7px', width: '110px' }}>Mã tài sản</th>
              <th style={{ border: cellBorder, padding: '5px 7px', width: '120px' }}>Số Serial (S/N)</th>
              <th style={{ border: cellBorder, padding: '5px 7px', width: '45px', textAlign: 'center' }}>SL</th>
              <th style={{ border: cellBorder, padding: '5px 7px', width: '150px' }}>Tình trạng</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: cellBorder, padding: '6px 7px', textAlign: 'center', fontWeight: 700 }}>01</td>
              <td style={{ border: cellBorder, padding: '6px 7px' }}>
                <div style={{ fontWeight: 700 }}>{asset.name}</div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  Phân loại: {categoryName}
                  {asset.brand ? ` · ${asset.brand}` : ''}
                  {asset.model ? ` ${asset.model}` : ''}
                </div>
              </td>
              <td style={{ border: cellBorder, padding: '6px 7px', fontFamily: 'monospace', fontWeight: 700 }}>
                {asset.assetCode}
              </td>
              <td style={{ border: cellBorder, padding: '6px 7px', fontFamily: 'monospace' }}>
                {asset.serialNumber || '—'}
              </td>
              <td style={{ border: cellBorder, padding: '6px 7px', textAlign: 'center', fontWeight: 700 }}>01</td>
              <td style={{ border: cellBorder, padding: '6px 7px', fontSize: '11.5px' }}>{assetCondition}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Phụ kiện */}
      {accessoriesList.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={sectionTitle}>II. Phụ kiện kèm theo:</div>
          <div style={{ border: cellBorder, padding: '8px 14px', fontSize: '12px', background: 'rgba(250, 250, 250, 0.55)', backdropFilter: 'blur(1.5px)' }}>
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
      )}

      {/* Nội dung cam kết */}
      <div style={{ marginBottom: 10, fontSize: '12.5px' }}>
        <div style={sectionTitle}>
          III. Nội dung {isHandover ? 'bàn giao' : 'thu hồi'}:
        </div>
        <ul style={{ margin: '4px 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <li>
            {isHandover ? 'Mục đích bàn giao' : 'Lý do thu hồi'}: {handoverPurpose}.
          </li>
          {isHandover ? (
            <>
              <li>
                Bên B đã nhận đủ tài sản và phụ kiện nêu trên, xác nhận thiết bị hoạt động bình thường tại thời
                điểm bàn giao.
              </li>
              <li>
                Bên B có trách nhiệm bảo quản, sử dụng tài sản đúng mục đích công việc và bàn giao lại đầy đủ khi
                có yêu cầu hoặc khi chấm dứt hợp đồng lao động.
              </li>
              <li>
                Trường hợp mất mát hoặc hư hỏng do lỗi chủ quan, Bên B chịu trách nhiệm bồi thường theo quy định
                của công ty.
              </li>
            </>
          ) : (
            <>
              <li>
                Bên A đã kiểm tra và tiếp nhận lại đầy đủ tài sản cùng phụ kiện nêu trên từ Bên B.
              </li>
              <li>
                Tài sản được nhập lại kho và cập nhật trạng thái trên hệ thống quản lý tài sản kể từ ngày ký biên
                bản này.
              </li>
              <li>
                Kể từ thời điểm ký, Bên B không còn trách nhiệm quản lý và sử dụng đối với tài sản nói trên.
              </li>
            </>
          )}
          {notes && <li>{notes}</li>}
        </ul>
      </div>

      <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 6 }}>
        Biên bản được lập thành 02 (hai) bản có giá trị như nhau, mỗi bên giữ 01 (một) bản để làm căn cứ theo dõi
        và quản lý tài sản.
      </div>

      <DocumentSignatures
        columns={[
          {
            title: isHandover ? 'ĐẠI DIỆN BÊN GIAO' : 'ĐẠI DIỆN BÊN NHẬN',
            hint: '(Ký và ghi rõ họ tên)',
            name: managerName,
          },
          {
            title: isHandover ? 'NGƯỜI NHẬN TÀI SẢN' : 'NGƯỜI BÀN GIAO TÀI SẢN',
            hint: '(Ký và ghi rõ họ tên)',
            name: employeeName,
          },
        ]}
      />
    </PrintDocumentModal>
  );
}
