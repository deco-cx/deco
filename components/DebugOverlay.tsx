/** @jsxRuntime automatic */
/** @jsxImportSource preact */

interface DebugEntry {
  resolver?: unknown;
  reason?: { cache: string; cacheKeyNull: boolean };
  timingMs?: number;
  sizeBytes?: number;
  resolverId?: string;
  loaderType?: string;
  propsPreview?: unknown;
  resultPreview?: unknown;
  sectionId?: string;
  component?: string;
  resolveChain?: unknown;
  pathTemplate?: string;
  url?: string;
  startMs?: number;
  endMs?: number;
}

interface Props {
  enabled: boolean;
  data: DebugEntry[];
}

export default function DebugOverlay({ enabled, data }: Props) {
  if (!enabled) return null;

  // Color palette – terminal green vibes
  const C = {
    bg: "#00120d",
    panel: "#001a12",
    border: "#0b3a2d",
    text: "#b1ffda",
    textDim: "#7de9bf",
    accent: "#00ff99",
    badge: "#073c2f",
    badgeText: "#a6ffd4",
  } as const;

  const containerStyle = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2147483647 as number,
    background: C.bg,
    backdropFilter: "blur(2px)",
    display: "flex",
    flexDirection: "column",
    color: C.text,
    border: `1px solid ${C.border}`,
    height: "50vh",
    width: "100vw",
    overflow: "hidden",
    boxSizing: "border-box" as const,
  } as const;

  const _panelStyle = {
    background: C.panel,
    color: C.text,
    borderTop: `1px solid ${C.border}`,
    padding: "10px 12px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  } as const;

  const listStyle = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: "13.5px",
    lineHeight: 1.4,
  } as const;

  const rowStyle = {
    padding: "8px",
    borderBottom: `1px solid ${C.border}`,
    cursor: "pointer",
  } as const;

  const preStyle = {
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  };

  const hintStyle = { padding: "8px", opacity: 0.85, color: C.textDim } as const;

  const headerStyle = {
    padding: "10px 12px",
    background: C.panel,
    borderBottom: `1px solid ${C.border}`,
    display: "flex",
    gap: 8,
    alignItems: "center",
  } as const;
  const twoCols = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    padding: 12,
    flex: 1,
    minHeight: 0,
  } as const;
  const pageRow = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    padding: 12,
  } as const;
  const pane = {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  } as const;
  const paneHeader = {
    padding: "6px 8px",
    borderBottom: `1px solid ${C.border}`,
    fontWeight: 600,
    background: C.bg,
    color: C.accent,
  } as const;
  const paneBody = {
    padding: 8,
    overflow: "auto",
    flex: 1,
    minHeight: 0,
  } as const;

  function renderBar(d: DebugEntry, all: DebugEntry[]) {
    const starts = all.map((e) => e.startMs ?? 0);
    const ends = all.map((e) => e.endMs ?? (e.startMs ?? 0));
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    if (!isFinite(min) || !isFinite(max) || max <= min) return null;
    const start = ((d.startMs ?? min) - min) / (max - min);
    const end = ((d.endMs ?? (d.startMs ?? min)) - min) / (max - min);
    const left = `${(start * 100).toFixed(2)}%`;
    const width = `${Math.max(0.5, (end - start) * 100).toFixed(2)}%`;
    return (
      <div style={{ position: 'absolute', left, width, top: 0, bottom: 0, background: C.accent, opacity: 0.6, borderRadius: 3 }} />
    );
  }

  const allEntries = (data ?? []).slice();
  const entries = allEntries.filter((e:any)=> (e && (e as any)['kind']) ? (e as any)['kind'] === 'loader' : true).sort((a, b) => (b.timingMs ?? 0) - (a.timingMs ?? 0));
  const totals = entries.reduce(
    (acc, e) => {
      acc.count++;
      acc.size += e.sizeBytes ?? 0;
      acc.time += e.timingMs ?? 0;
      return acc;
    },
    { count: 0, size: 0, time: 0 },
  );

  const bySection = entries.reduce((acc: Record<string, DebugEntry[]>, e) => {
    const key = e.sectionId || e.component || "unknown";
    acc[key] = acc[key] || [];
    acc[key].push(e);
    return acc;
  }, {} as Record<string, DebugEntry[]>);

  return (
    <div id="__deco_debug_overlay__" style={containerStyle}>
      <div style={headerStyle}>
        <strong id="__deco_debug_title__">Deco Debug</strong>
        <span id="__deco_debug_sub__" style={{ opacity: 0.9, color: C.textDim }}>loaders={entries.length} • total={formatMs(totals.time)} • size={formatBytes(totals.size)} • press D to toggle</span>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <input placeholder="Filter by resolver/component..." onInput={(e) => filterList((e.currentTarget && (e.currentTarget as any).value) || '')} style={{ width: 320, padding: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 4 }}/>
          <button type="button" onClick={() => copyJSON(entries)} style={btnStyle}>Copy JSON</button>
          <button type="button" id="__deco_debug_close__" style={{ ...btnStyle, padding: '4px 8px' }}>✕</button>
        </div>
      </div>
      
      <div style={twoCols}>
        <div style={{ ...pane }}>
          <div style={paneHeader}>Loaders (sorted by time)</div>
          <div style={{ ...paneBody, ...listStyle }} id="__deco_debug_list__">
            {entries.map((d) => (
              <div
                style={rowStyle}
                class="__deco_entry"
                role="button"
                data-idx={`${entries.indexOf(d)}`}
              >
                <div style={{ position: 'relative', height: 6, marginBottom: 6, background: '#022018', borderRadius: 3 }}>
                  {renderBar(d, entries)}
                </div>
                <div>
                  <span style={badgeStyle}>id</span> {d.resolverId ?? ''}
                  <span style={badge(d.loaderType)}>{d.loaderType}</span>
                  <span style={badge(d.reason?.cache)}>{d.reason?.cache}</span>
                  {d.reason?.cacheKeyNull ? <span style={badgeStyle}>cacheKey:null</span> : null}
                  <span style={{ float: 'right' }}>{formatMs(d.timingMs)} • {formatBytes(d.sizeBytes)}</span>
                </div>
                <div style={{ opacity: 0.8, marginTop: 2 }}>
                  {d.component || ''}
                </div>
                {d.pathTemplate || d.url ? (
                  <div style={{ opacity: 0.8 }}>
                    {d.pathTemplate ? <span>route: {d.pathTemplate} </span> : null}
                    {d.url ? <span>url: {d.url}</span> : null}
                  </div>
                ) : null}
              </div>
            ))}
            {!entries.length && (
              <div style={hintStyle}>No loader debug entries captured. Ensure the page was loaded with <code>?__d</code> and the server restarted.</div>
            )}
          </div>
        </div>
        <div style={{ ...pane }}>
          <div style={paneHeader}>Details</div>
          <div style={{ ...paneBody }}>
            <div style={listStyle}>
              <div style={{ marginBottom: 8 }}>
                <div style={paneHeader}>meta</div>
                <pre id="__deco_debug_meta__" style={{ ...preStyle as any, ...paneBody }}></pre>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: '100%' }}>
                <div style={{ ...pane, height: '100%', minHeight: 0 }}>
                  <div style={paneHeader}>props</div>
                  <button type="button" id="__deco_debug_render_props__" style={btnStyle}>Render props</button>
                  <pre id="__deco_debug_props__" style={{ ...preStyle as any, ...paneBody }}></pre>
                </div>
                <div style={{ ...pane, height: '100%', minHeight: 0 }}>
                  <div style={paneHeader}>result</div>
                  <button type="button" id="__deco_debug_render_result__" style={btnStyle}>Render result</button>
                  <pre id="__deco_debug_result__" style={{ ...preStyle as any, ...paneBody }}></pre>
                </div>
              </div>
              <div style={{ ...pane, marginTop: 8 }}>
                <div style={paneHeader}>resolveChain</div>
                <button type="button" id="__deco_debug_render_chain__" style={btnStyle}>Render chain</button>
                <pre id="__deco_debug_chain__" style={{ ...preStyle as any, ...paneBody }}></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `window.__DECO_DEBUG_DATA__ = ${safeStringify(entries)};` }} />
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          const root = document.getElementById('__deco_debug_list__');
          const overlay = document.getElementById('__deco_debug_overlay__');
          const closeBtn = document.getElementById('__deco_debug_close__');
          const title = document.getElementById('__deco_debug_title__');
          const sub = document.getElementById('__deco_debug_sub__');
          try {
            // detach from framework root to avoid hydration issues
            if (overlay && overlay.parentElement && overlay.parentElement !== document.body) {
              overlay.parentElement.removeChild(overlay);
              document.body.appendChild(overlay);
            }
          } catch {}
          console.log('[deco-debug] overlay mounted');
          // Read page meta to enrich title
          try {
            var meta = document.querySelector('meta[name="deco:page"]');
            if (meta && meta.getAttribute('content')) {
              var content = meta.getAttribute('content');
              var info = null; try { info = JSON.parse(content); } catch(_){}
              if (info && info.pathTemplate) {
                title && (title.textContent = 'Deco Debug — page=' + info.pathTemplate);
              }
            }
          } catch(_){ }
          function toggle(){ if(!overlay) return; overlay.style.display = (overlay.style.display==='none') ? '' : 'none'; }
          window.addEventListener('keydown', (e)=>{ if(e.key==='d'||e.key==='D'){ toggle(); } });
          closeBtn && closeBtn.addEventListener('click', toggle);
          let data = null;
          function ensureData(){ if(data!==null) return; try { data = (window).__DECO_DEBUG_DATA__ || []; } catch { data=[]; } console.log('[deco-debug] entries:', Array.isArray(data)?data.length:0); }
          const propsOut = document.getElementById('__deco_debug_props__');
          const resultOut = document.getElementById('__deco_debug_result__');
          const metaOut = document.getElementById('__deco_debug_meta__');
          const chainOut = document.getElementById('__deco_debug_chain__');
          const renderPropsBtn = document.getElementById('__deco_debug_render_props__');
          const renderResultBtn = document.getElementById('__deco_debug_render_result__');
          const renderChainBtn = document.getElementById('__deco_debug_render_chain__');
          let currentIdx = -1;
          let activeEl = null;
          // Listen for async debug chunks being pushed by partial renders
          try {
            window.addEventListener('deco:debug:add', function(ev){
              try {
                const payload = (ev && ev.detail && ev.detail.entries) || [];
                if (!Array.isArray(payload) || payload.length === 0) return;
                ensureData();
                const base = Array.isArray(data) ? data : [];
                for (var i=0;i<payload.length;i++){ base.push(payload[i]); }
                (window).__DECO_DEBUG_DATA__ = data = base;
                // append new rows to the list
                const entries = base.filter(function(e){ return !e.kind || e.kind==='loader'; }).sort(function(a,b){ return (b.timingMs||0)-(a.timingMs||0); });
                const list = document.getElementById('__deco_debug_list__');
                if (!list) return;
                list.textContent = '';
                for (var j=0;j<entries.length;j++){
                  var d = entries[j];
                  var row = document.createElement('div');
                  row.className='__deco_entry'; row.setAttribute('role','button'); row.setAttribute('data-idx', String(j));
                  row.style.padding='8px'; row.style.borderBottom='1px solid #0b3a2d'; row.style.cursor='pointer';
                  var ruler=document.createElement('div'); ruler.style.position='relative'; ruler.style.height='6px'; ruler.style.marginBottom='6px'; ruler.style.background='#022018'; ruler.style.borderRadius='3px';
                  row.appendChild(ruler);
                  var meta=document.createElement('div'); meta.innerHTML='<span style="background:#073c2f;color:#a6ffd4;padding:0 6px;border-radius:4px;font-size:11px;text-transform:uppercase">id</span> '+(d.resolverId||'');
                  var right=document.createElement('span'); right.style.float='right'; right.textContent=(d.timingMs||0).toFixed(1)+' ms • '+(d.sizeBytes?d.sizeBytes+' B':''); meta.appendChild(right);
                  row.appendChild(meta);
                  var comp=document.createElement('div'); comp.style.opacity='0.8'; comp.textContent=d.component||''; row.appendChild(comp);
                  list.appendChild(row);
                }
              } catch(_){ }
            });
          } catch(_){ }
          function showFromIdx(idx){
            ensureData(); currentIdx = idx; const d = data[idx]; if(!d) return;
            propsOut.textContent = '';
            resultOut.textContent = '';
            chainOut.textContent = '';
            // lightweight summaries by default
            renderLimited(d.propsPreview, propsOut);
            renderLimited(d.resultPreview, resultOut);
            metaOut.textContent = JSON.stringify({resolverId:d.resolverId, component:d.component, cache:d.reason?.cache, type:d.loaderType, timingMs:d.timingMs, sizeBytes:d.sizeBytes, route:d.pathTemplate, url:d.url}, null, 2);
            console.log('[deco-debug] selected idx', idx);
          }
          // init with first entry
          showFromIdx(0);
          // highlight first
          try { const first = root?.querySelector('.__deco_entry'); if(first){ first.style.background='rgba(0,255,153,0.06)'; } } catch {}
          root?.addEventListener('click', function(ev){
            const el = ev.target && (ev.target).closest('.__deco_entry');
            if(!el) return; const idx = Number(el.getAttribute('data-idx')); if(!Number.isFinite(idx)) return;
            if(activeEl){ activeEl.style.background=''; }
            activeEl = el; activeEl.style.background = 'rgba(0,255,153,0.06)';
            showFromIdx(idx);
            // highlight corresponding section row and DOM section
            try {
              ensureData();
              const d = data[idx];
              const sid = d && (d.sectionId || d.component || '');
              // highlight row in sections panel
              const prev = document.querySelector('#__deco_debug_sections__ .__deco_section_row.__active');
              if (prev) {
                prev.classList.remove('__active');
                if (prev instanceof HTMLElement) { prev.style.background = ''; }
              }
              const selector = '#__deco_debug_sections__ .__deco_section_row[data-id="' + CSS.escape(sid) + '"]';
              const row = sid ? document.querySelector(selector) : null;
              if (row && row instanceof HTMLElement) {
                row.style.background = 'rgba(0,255,153,0.08)';
                row.classList.add('__active');
                row.scrollIntoView({ block: 'nearest' });
              }
              // highlight real section behind overlay
              if (sid) {
                const domSection = document.getElementById(sid);
                if (domSection && domSection instanceof HTMLElement) {
                  domSection.style.outline = '2px solid #00ff99';
                  setTimeout(()=>{ domSection.style.outline = ''; }, 1200);
                }
              }
            } catch {}
          });
          function renderLimited(obj, out){
            ensureData(); try {
              const str = JSON.stringify(obj, null, 2);
              const MAX = 200000; // ~200KB
              // Avoid any odd unicode tokens inside inline script
              out.textContent = str.length > MAX ? (str.slice(0, MAX) + "\\n[truncated]") : str;
            } catch {}
          }
          // (page/sections UI removed per request)
          renderPropsBtn?.addEventListener('click', ()=>{ if(currentIdx<0) return; ensureData(); const d = data[currentIdx]; renderLimited(d?.propsPreview, propsOut); });
          renderResultBtn?.addEventListener('click', ()=>{ if(currentIdx<0) return; ensureData(); const d = data[currentIdx]; renderLimited(d?.resultPreview, resultOut); });
          renderChainBtn?.addEventListener('click', ()=>{ if(currentIdx<0) return; ensureData(); const d = data[currentIdx]; renderLimited(d?.resolveChain, chainOut); });
        })();
      `}} />
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "[unserializable]";
  }
}

function formatMs(v?: number) {
  if (!v && v !== 0) return '';
  return `${v.toFixed(1)} ms`;
}
function formatBytes(v?: number) {
  if (!v && v !== 0) return '';
  const units = ['B','KB','MB','GB'];
  let i = 0; let n = v;
  while (n >= 1024 && i < units.length-1) { n/=1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}
function badge(kind?: string) {
  return {
    display: 'inline-block', marginLeft: 6, padding: '0 6px', borderRadius: 4,
    background: kind==='miss' ? '#5a1c14' : kind==='hit' ? '#054d3a' : '#073c2f',
    color: '#a6ffd4', fontSize: 11, textTransform: 'uppercase'
  } as const;
}
const badgeStyle = {
  display: 'inline-block', padding: '0 6px', borderRadius: 4, background: '#073c2f', color: '#a6ffd4', fontSize: 11, textTransform: 'uppercase', marginLeft: 6
} as const;
const btnStyle = {
  padding: '6px 8px', border: '1px solid #0b3a2d', background: '#00120d', color: '#b1ffda', borderRadius: 4, cursor: 'pointer'
} as const;
function filterList(q: string) {
  const list = document.getElementById('__deco_debug_list__');
  if (!list) return;
  const items = list.querySelectorAll('.__deco_entry');
  const query = q.toLowerCase();
  items.forEach((el) => {
    const text = el.textContent?.toLowerCase() || '';
    (el as HTMLElement).style.display = text.includes(query) ? '' : 'none';
  });
}
function copyJSON(obj: unknown) {
  try { navigator.clipboard.writeText(JSON.stringify(obj, null, 2)); } catch {}
}


