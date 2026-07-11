export function renderIvoryPortal(ivoryPortalElement: HTMLDivElement | null) {
  if (!ivoryPortalElement) {
    return;
  }

  const w = Math.max(360, Math.round(window.innerWidth));
  const h = Math.max(360, Math.round(window.innerHeight));
  const mobilePortal = w < 560;

  // Mobile keeps the side columns thin so the dome banner doesn't waste width;
  // openL/openR run to the actual viewport edges so the arch has no side legs
  // dropping down past the curve — black sits only in the upper corners.
  const colW = mobilePortal ? Math.min(58, Math.max(38, w * 0.12)) : Math.min(330, Math.max(138, w * 0.16));
  const openL = mobilePortal ? 0 : colW;
  const openR = mobilePortal ? w : w - colW;
  const spring = mobilePortal ? h * 0.32 : h * 0.58;
  const archBottom = h;
  const domeCtrl = mobilePortal ? h * 0.06 : h * 0.05;
  const stroke = Math.max(1.6, w * 0.0015);

  const opening = `M${openL} ${archBottom} L${openL} ${spring} C${openL} ${domeCtrl} ${openR} ${domeCtrl} ${openR} ${spring} L${openR} ${archBottom} Z`;
  // Hairline lives just inside the desktop arch dome; on mobile the curve runs
  // edge-to-edge so a hairline would either disappear in the open area or fight
  // the title — skip it.
  const hairL = colW * 0.84;
  const hairR = w - colW * 0.84;
  const hairCtrl = domeCtrl - h * 0.022;
  const hairline = `M${hairL} ${spring} C${hairL} ${hairCtrl} ${hairR} ${hairCtrl} ${hairR} ${spring}`;
  const hairlineFragment = mobilePortal
    ? ''
    : `<path d="${hairline}" fill="none" stroke="#000000" stroke-width="${stroke}" />`;

  const titleSize = mobilePortal ? Math.min(24, Math.max(20, w * 0.058)) : Math.min(74, Math.max(26, w * 0.046));
  const titleY = mobilePortal ? Math.max(54, h * 0.09) : Math.max(42, h * 0.115);
  const titleLS = titleSize * (mobilePortal ? 0.09 : 0.12);
  const subSize = mobilePortal ? Math.min(9, Math.max(7.2, w * 0.02)) : Math.min(18, Math.max(9.5, w * 0.0118));
  const subY = titleY + titleSize * 0.66;
  const subLS = subSize * (mobilePortal ? 0.22 : 0.5);
  const subtitle = mobilePortal ? 'TAP GHOST DRESS \u00B7 DIFF\u00C9RANCE' : 'STUDIO STUDY \u2014 CLICK GHOST DRESS \u00B7 DIFF\u00C9RANCE';

  const colSize = mobilePortal ? Math.min(9.5, Math.max(8.2, w * 0.023)) : Math.min(20, Math.max(11, w * 0.0132));
  const lineH = colSize * (mobilePortal ? 1.52 : 1.72);
  const colTop = mobilePortal ? h * 0.62 : h * 0.5;
  const colInset = mobilePortal ? Math.max(11, colW * 0.13) : Math.max(16, colW * 0.2);
  const leftX = colInset;
  const rightX = w - colInset;

  const leftLines = ['Italian born', 'New York house', 'Arden years', 'Coty award', 'silk metallic'];
  const rightLines = ['Click a ghost', 'switch the scan', 'keep the arc', 'watch the cloth', 'return to front'];
  const leftTspans = leftLines
    .map((line, index) => `<tspan x="${leftX}"${index ? ` dy="${lineH}"` : ''}>${line}</tspan>`)
    .join('');
  const rightTspans = rightLines
    .map((line, index) => `<tspan x="${rightX}"${index ? ` dy="${lineH}"` : ''}>${line}</tspan>`)
    .join('');
  // Side columns sit on the lower black strip on desktop. On mobile the dome
  // banner has no lower strip — drop the columns so they don't render as dead
  // space or float over the dress.
  const sideColumnsFragment = mobilePortal
    ? ''
    : `<text x="${leftX}" y="${colTop}" text-anchor="start" font-size="${colSize}" font-weight="400" letter-spacing="1.2">${leftTspans}</text>
            <text x="${rightX}" y="${colTop}" text-anchor="end" font-size="${colSize}" font-weight="400" letter-spacing="1.2">${rightTspans}</text>`;

  ivoryPortalElement.innerHTML = `
    <svg class="ivory-portal__svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="ivoryPortalMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">
          <rect width="${w}" height="${h}" fill="#ffffff" />
          <path d="${opening}" fill="#000000" />
          ${hairlineFragment}
          <g fill="#000000" font-family="Inter, ui-sans-serif, system-ui, sans-serif">
            <text x="${w / 2}" y="${titleY}" text-anchor="middle" font-size="${titleSize}" font-weight="600" letter-spacing="${titleLS}">FASHION SYSTEM</text>
            <text x="${w / 2}" y="${subY}" text-anchor="middle" font-size="${subSize}" font-weight="500" letter-spacing="${subLS}">${subtitle}</text>
            ${sideColumnsFragment}
          </g>
        </mask>
      </defs>
      <g>
        <rect width="${w}" height="${h}" fill="#0b0a08" mask="url(#ivoryPortalMask)" />
      </g>
    </svg>
  `;
}
