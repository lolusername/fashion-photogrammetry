import * as THREE from 'three';

import { DRESS_ASSETS, type DressAssetId } from '../config/dresses';
import type { CycloramaBackgroundPresetId } from '../config/themes';
import type { DressThumbnailRecord, SignalGraphNodeRecord } from '../app/experienceTypes';

export type SignalDiptychOptions = {
  element: HTMLDivElement | null;
  thumbnails: Map<DressAssetId, DressThumbnailRecord>;
  getThemeId: () => CycloramaBackgroundPresetId;
  getDressId: () => DressAssetId;
  getPixelRatio: () => number;
};

export class SignalDiptych {
  private readonly element: HTMLDivElement | null;
  private readonly thumbnails: Map<DressAssetId, DressThumbnailRecord>;
  private readonly getThemeId: () => CycloramaBackgroundPresetId;
  private readonly getDressId: () => DressAssetId;
  private readonly getPixelRatio: () => number;
  private readonly records = new Map<DressAssetId, SignalGraphNodeRecord>();

  constructor(options: SignalDiptychOptions) {
    this.element = options.element;
    this.thumbnails = options.thumbnails;
    this.getThemeId = options.getThemeId;
    this.getDressId = options.getDressId;
    this.getPixelRatio = options.getPixelRatio;
  }

  build() {
      const signalDiptychElement = this.element;
    if (!signalDiptychElement || this.getThemeId() !== 'signal-black') {
      return;
    }
  
    const w = Math.max(360, Math.round(window.innerWidth));
    const h = Math.max(360, Math.round(window.innerHeight));
    const mid = w / 2;
    const activeId = this.getDressId();
  
    const mono = "'JetBrains Mono', 'Geist Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace";
    const red = '#ff2030';
    const redDim = 'rgba(255, 32, 48, 0.55)';
    const redFaint = 'rgba(255, 32, 48, 0.2)';
    const inkDim = 'rgba(255, 230, 196, 0.55)';
    const inkFaint = 'rgba(255, 230, 196, 0.22)';
    const green = '#3aff5e';
    const gridLine = 'rgba(255, 80, 20, 0.05)';
  
    const unit = Math.min(w, h);
    const nodeSize = Math.max(110, unit * 0.19);
    const headerH = Math.max(34, h * 0.054);
    const headerY = headerH / 2;
    const headerFont = Math.max(10, Math.min(15, h * 0.0145));
    const microFont = Math.max(8.5, Math.min(12, w * 0.0075));
    const labelFont = Math.max(10, Math.min(14, w * 0.0095));
  
    const px = (fx: number) => mid * fx;
    const py = (fy: number) => h * fy;
    const leftPad = Math.max(14, w * 0.018);
    const rightPad = Math.max(14, w * 0.018);
  
    const nodeA = { id: 'original' as DressAssetId, x: px(0.36), y: py(0.46), label: DRESS_ASSETS.original.label };
    const nodeB = { id: 'patchwork' as DressAssetId, x: px(0.68), y: py(0.66), label: DRESS_ASSETS.patchwork.label };
    const nodes = [nodeA, nodeB];
    const activeNode = activeId === 'original' ? nodeA : nodeB;
    const ringR = nodeSize * 0.58;
  
    // Helpers --------------------------------------------------------------
    const lineSeg = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1, dash = '') =>
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
    const cornerBrackets = (x: number, y: number, ww: number, hh: number, len: number, color: string, sw = 1.4) => [
      lineSeg(x, y, x + len, y, color, sw), lineSeg(x, y, x, y + len, color, sw),
      lineSeg(x + ww, y, x + ww - len, y, color, sw), lineSeg(x + ww, y, x + ww, y + len, color, sw),
      lineSeg(x, y + hh, x + len, y + hh, color, sw), lineSeg(x, y + hh, x, y + hh - len, color, sw),
      lineSeg(x + ww, y + hh, x + ww - len, y + hh, color, sw), lineSeg(x + ww, y + hh, x + ww, y + hh - len, color, sw),
    ].join('');
  
    // Faint grid background (left pane only, pure decoration) -------------
    const gridCols = 18;
    const gridRows = 14;
    const gridFrags: string[] = [];
    for (let i = 1; i < gridCols; i++) {
      gridFrags.push(lineSeg((mid / gridCols) * i, headerH, (mid / gridCols) * i, h, gridLine));
    }
    for (let i = 1; i < gridRows; i++) {
      const y = headerH + ((h - headerH) / gridRows) * i;
      gridFrags.push(lineSeg(0, y, mid, y, gridLine));
    }
  
    // Header strip — minimal, real labels only ----------------------------
    const swatchSize = headerFont * 0.95;
    const swatchY = (headerH - swatchSize) / 2;
    const headerStrip = `
      ${lineSeg(0, headerH, w, headerH, redDim)}
      <rect x="${leftPad}" y="${swatchY.toFixed(1)}" width="${swatchSize.toFixed(1)}" height="${swatchSize.toFixed(1)}" fill="${red}" />
      <text x="${(leftPad + swatchSize + headerFont * 0.7).toFixed(1)}" y="${(headerY + headerFont * 0.36).toFixed(1)}" font-family="${mono}" font-size="${headerFont}" font-weight="800" letter-spacing="${(headerFont * 0.14).toFixed(2)}" fill="${red}">FASHION SYSTEM</text>
      <text x="${(w - rightPad).toFixed(1)}" y="${(headerY + headerFont * 0.36).toFixed(1)}" text-anchor="end" font-family="${mono}" font-size="${headerFont}" font-weight="500" letter-spacing="${(headerFont * 0.22).toFixed(2)}" fill="${inkDim}">FIG. SARMI</text>
    `;
  
    // Dashed divider between panes
    const divider = lineSeg(mid, headerH, mid, h, redDim, 1, '2 4');
  
    // Pane titles ---------------------------------------------------------
    const paneTitleY = headerH + Math.max(26, h * 0.036);
    const leftPaneTitle = `
      <text x="${leftPad}" y="${paneTitleY.toFixed(1)}" font-family="${mono}" font-size="${labelFont}" font-weight="800" letter-spacing="${(labelFont * 0.22).toFixed(2)}" fill="${red}">GARMENT GRAPH</text>
      <text x="${leftPad}" y="${(paneTitleY + labelFont * 1.6).toFixed(1)}" font-family="${mono}" font-size="${microFont}" font-weight="500" letter-spacing="${(microFont * 0.3).toFixed(2)}" fill="${inkDim}">CLICK NODE TO LOAD DRESS</text>
    `;
    const rightPaneTitle = `
      <text x="${(w - rightPad).toFixed(1)}" y="${paneTitleY.toFixed(1)}" text-anchor="end" font-family="${mono}" font-size="${labelFont}" font-weight="800" letter-spacing="${(labelFont * 0.22).toFixed(2)}" fill="${red}">ACTIVE DRESS</text>
    `;
  
    // Radar concentric rings around the graph midpoint (pure decoration) --
    const graphCx = (nodeA.x + nodeB.x) / 2;
    const graphCy = (nodeA.y + nodeB.y) / 2;
    const radarRings = [0.16, 0.26, 0.36, 0.46].map((rFrac) => {
      const r = unit * rFrac;
      return `<circle cx="${graphCx.toFixed(1)}" cy="${graphCy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${redFaint}" stroke-width="1" />`;
    }).join('');
    const radarMaxR = unit * 0.46;
    const radarCross = lineSeg(graphCx - radarMaxR, graphCy, graphCx + radarMaxR, graphCy, redFaint)
                     + lineSeg(graphCx, graphCy - radarMaxR, graphCx, graphCy + radarMaxR, redFaint);
  
    // Primary edge between the two dress nodes (no fake labels)
    const primaryEdge = lineSeg(nodeA.x, nodeA.y, nodeB.x, nodeB.y, red, 1.6);
  
    // Right pane corner brackets (frames the active dress) ---------------
    const rightFrameX = mid + rightPad * 0.7;
    const rightFrameY = headerH + 22;
    const rightFrameW = mid - rightPad * 1.4;
    const rightFrameH = h - headerH - 48;
    const rightFrameBrackets = cornerBrackets(rightFrameX, rightFrameY, rightFrameW, rightFrameH, Math.max(18, unit * 0.024), red, 1.6);
  
    // Right edge tick ladder (decorative; no numbers)
    const rightTicks = Array.from({ length: 24 }, (_, i) => {
      const ty = headerH + 22 + ((h - headerH - 44) / 23) * i;
      const tlen = i % 5 === 0 ? 14 : 7;
      return lineSeg(w - rightPad * 0.3, ty, w - rightPad * 0.3 - tlen, ty, redDim);
    }).join('');
  
    // Bottom-left archival note block ------------------------------------
    const noteFont = microFont;
    const noteLines = [
      'italian-born american house.',
      'arden designer before sarmi.',
      'coty award, new york, 1960.',
      'select a node to traverse.',
    ];
    const noteY0 = py(0.86);
    const noteText = noteLines.map((line, i) =>
      `<text x="${leftPad}" y="${(noteY0 + i * noteFont * 1.65).toFixed(1)}" font-family="${mono}" font-size="${noteFont}" font-weight="500" letter-spacing="0.4" fill="${inkFaint}">${line}</text>`,
    ).join('');
  
    // BASE SVG (below the dress canvases) ---------------------------------
    const baseSvg = `
      <svg class="signal-diptych__svg signal-diptych__base" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        ${gridFrags.join('')}
        ${headerStrip}
        ${divider}
        ${leftPaneTitle}
        ${rightPaneTitle}
        ${radarRings}
        ${radarCross}
        ${primaryEdge}
        ${noteText}
        ${rightFrameBrackets}
        ${rightTicks}
      </svg>`;
  
    // OVERLAY SVG (above the dress canvases): crosshair + ring + labels ---
    const crosshair = (cx: number, cy: number, r: number) => {
      const gap = r + 8;
      const len = r + 28;
      return lineSeg(cx - len, cy, cx - gap, cy, green, 1.6)
           + lineSeg(cx + len, cy, cx + gap, cy, green, 1.6)
           + lineSeg(cx, cy - len, cx, cy - gap, green, 1.6)
           + lineSeg(cx, cy + len, cx, cy + gap, green, 1.6);
    };
    const activeBrackets = cornerBrackets(activeNode.x - ringR - 12, activeNode.y - ringR - 12, (ringR + 12) * 2, (ringR + 12) * 2, 14, green, 2);
    const overlaySvg = `
      <svg class="signal-diptych__svg signal-diptych__overlay" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        ${crosshair(activeNode.x, activeNode.y, ringR)}
        <circle cx="${activeNode.x.toFixed(1)}" cy="${activeNode.y.toFixed(1)}" r="${ringR.toFixed(1)}" fill="none" stroke="${green}" stroke-width="2.4" />
        <circle cx="${activeNode.x.toFixed(1)}" cy="${activeNode.y.toFixed(1)}" r="${(ringR + 6).toFixed(1)}" fill="none" stroke="${green}" stroke-width="1" opacity="0.32" stroke-dasharray="3 4" />
        ${activeBrackets}
      </svg>`;
  
    // Preserve existing node canvases (their WebGL renderers + scenes persist
    // across rebuilds) so rebuilding the SVG never tears down GPU state.
    const existingCanvases = new Map<DressAssetId, HTMLCanvasElement>();
    this.records.forEach((record, id) => existingCanvases.set(id, record.canvas));
  
    signalDiptychElement.innerHTML = baseSvg + overlaySvg;
  
    const canvasSize = Math.round(nodeSize * 1.6);
    nodes.forEach((node) => {
      let canvas = existingCanvases.get(node.id);
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'signal-diptych__node';
        canvas.dataset.dressId = node.id;
      }
      const isActive = node.id === activeId;
      canvas.dataset.active = String(isActive);
      canvas.style.left = `${node.x - canvasSize / 2}px`;
      canvas.style.top = `${node.y - canvasSize / 2}px`;
      canvas.style.width = `${canvasSize}px`;
      canvas.style.height = `${canvasSize}px`;
      canvas.dataset.signalNodeSize = String(canvasSize);
      canvas.setAttribute('role', 'button');
      canvas.setAttribute('aria-label', `Switch to ${node.label}`);
      canvas.setAttribute('aria-pressed', String(isActive));
      canvas.tabIndex = isActive ? -1 : 0;
      // Insert between base svg and overlay svg so the green ring sits above.
      const overlay = signalDiptychElement.querySelector('.signal-diptych__overlay');
      signalDiptychElement.insertBefore(canvas, overlay);
      const record = this.ensureNodeRecord(node.id, canvas);
      record.renderer.setSize(canvasSize, canvasSize, false);
    });
  
    this.render();
  }

  private ensureNodeRecord(assetId: DressAssetId, canvas: HTMLCanvasElement) {
    const existing = this.records.get(assetId);
    if (existing && existing.canvas === canvas) {
      return existing;
    }
    if (existing) {
      existing.renderer.dispose();
      this.records.delete(assetId);
    }
  
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(this.getPixelRatio());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
  
    const record: SignalGraphNodeRecord = { assetId, canvas, renderer };
    this.records.set(assetId, record);
    return record;
  }

  render() {
    if (this.getThemeId() !== 'signal-black') {
      return;
    }
    this.records.forEach((node) => {
      const thumb = this.thumbnails.get(node.assetId);
      if (!thumb?.root) {
        return;
      }
      const styled = Number(node.canvas.dataset.signalNodeSize || '0');
      const size = styled || node.canvas.clientWidth || 128;
      node.renderer.setPixelRatio(this.getPixelRatio());
      node.renderer.setSize(size, size, false);
      thumb.camera.aspect = 1;
      thumb.camera.updateProjectionMatrix();
      node.renderer.render(thumb.scene, thumb.camera);
    });
  }

  dispose() {
    this.records.forEach((record) => record.renderer.dispose());
    this.records.clear();
  }
}
