"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "earth" | "horizon" | "equatorial";
type Point = { a: number; b: number };
type SphereProps = {
  mode: Mode;
  point: Point;
  showGrid: boolean;
  showLabels: boolean;
  autoRotate?: boolean;
  pointLabel?: string;
  hidePointValues?: boolean;
};

const TAU = Math.PI * 2;
const rad = (value: number) => (value * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wrap = (value: number, max: number) => ((value % max) + max) % max;

function formatLon(value: number) {
  if (Math.abs(value) < 0.05) return "0°";
  return `${Math.abs(value).toFixed(1).replace(".0", "")}° ${value >= 0 ? "E" : "W"}`;
}

function formatLat(value: number) {
  if (Math.abs(value) < 0.05) return "0°";
  return `${Math.abs(value).toFixed(1).replace(".0", "")}° ${value >= 0 ? "N" : "S"}`;
}

function formatAz(value: number) {
  return `${Math.round(wrap(value, 360))}°`;
}

function formatAlt(value: number) {
  return `${value.toFixed(1).replace(".0", "")}°`;
}

function formatRa(value: number) {
  const h = Math.floor(wrap(value, 24));
  const m = Math.round((wrap(value, 24) - h) * 60);
  return `${h}ʰ ${String(m).padStart(2, "0")}ᵐ`;
}

function SphereCanvas({ mode, point, showGrid, showLabels, autoRotate = false, pointLabel, hidePointValues = false }: SphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ yaw: mode === "earth" ? -0.5 : -0.25, pitch: mode === "equatorial" ? 0.22 : -0.08, zoom: 1 });
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let last = performance.now();
    let running = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, Math.round(rect.width * ratio));
      const height = Math.max(320, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const draw = (now: number) => {
      if (!running) return;
      resize();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (autoRotate && !dragRef.current) viewRef.current.yaw += dt * 0.24;

      const ratio = canvas.width / Math.max(canvas.clientWidth, 1);
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2 + 2 * ratio;
      const radius = Math.min(w, h) * 0.355 * viewRef.current.zoom;
      ctx.clearRect(0, 0, w, h);

      const shadow = ctx.createRadialGradient(cx, cy + radius * 1.1, radius * 0.1, cx, cy + radius * 1.1, radius * 0.95);
      shadow.addColorStop(0, "rgba(35,64,72,.22)");
      shadow.addColorStop(1, "rgba(35,64,72,0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius * 1.08, radius * 0.92, radius * 0.18, 0, 0, TAU);
      ctx.fill();

      const surface = ctx.createRadialGradient(cx - radius * 0.34, cy - radius * 0.4, radius * 0.08, cx, cy, radius * 1.08);
      if (mode === "earth") {
        surface.addColorStop(0, "#d9f4f0"); surface.addColorStop(0.42, "#77c9cf"); surface.addColorStop(1, "#26749a");
      } else {
        surface.addColorStop(0, "#f7fcfb"); surface.addColorStop(0.55, "#d9eeee"); surface.addColorStop(1, "#93bdc8");
      }
      ctx.fillStyle = surface;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();

      const project = (a: number, b: number) => {
        const lon = rad(a);
        const lat = rad(b);
        const x = Math.cos(lat) * Math.sin(lon);
        const y = Math.sin(lat);
        const z = Math.cos(lat) * Math.cos(lon);
        const yaw = viewRef.current.yaw;
        const pitch = viewRef.current.pitch;
        const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
        const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
        const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
        const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
        return { x: cx + x1 * radius, y: cy - y1 * radius, z: z2 };
      };

      const curve = (points: Array<[number, number]>, color: string, width = 1, dash: number[] = []) => {
        ctx.strokeStyle = color; ctx.lineWidth = width * ratio; ctx.setLineDash(dash.map((n) => n * ratio));
        let open = false;
        ctx.beginPath();
        points.forEach(([a, b]) => {
          const p = project(a, b);
          if (p.z >= -0.015) {
            if (!open) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            open = true;
          } else open = false;
        });
        ctx.stroke(); ctx.setLineDash([]);
      };

      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius - ratio, 0, TAU); ctx.clip();
      if (mode === "earth") {
        ctx.fillStyle = "rgba(80,151,91,.72)";
        const lands = [[-75,35,30,70],[-50,-15,22,58],[50,40,75,55],[105,12,55,38],[135,-27,28,20]];
        lands.forEach(([a,b,rx,ry]) => { const p=project(a,b); if(p.z>0){ ctx.beginPath();ctx.ellipse(p.x,p.y,rx*ratio,ry*ratio,rad(a/5),0,TAU);ctx.fill(); } });
      }
      if (showGrid) {
        for (let a = -150; a <= 180; a += 30) {
          curve(Array.from({ length: 73 }, (_, i) => [a, -90 + i * 2.5]), mode === "earth" ? "rgba(255,224,100,.72)" : "rgba(46,119,151,.48)", a === 0 ? 2.1 : 0.85);
        }
        for (let b = -60; b <= 60; b += 30) {
          curve(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, b]), mode === "earth" ? "rgba(210,247,174,.78)" : "rgba(44,160,150,.55)", b === 0 ? 2.3 : 0.9);
        }
      }
      if (mode === "horizon") {
        curve(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, 0]), "#f0a84b", 3);
        curve(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, 35]), "rgba(240,168,75,.42)", 1.5, [5,4]);
      }
      if (mode === "equatorial") {
        curve(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, 0]), "#e86b62", 3);
      }
      ctx.restore();

      ctx.strokeStyle = mode === "earth" ? "#1f6687" : "#6f9dab";
      ctx.lineWidth = 2 * ratio; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();

      if (showLabels) {
        ctx.font = `700 ${12 * ratio}px Arial, sans-serif`;
        ctx.fillStyle = "#355463"; ctx.textAlign = "center";
        const top = project(0, 90); const bottom = project(0, -90);
        ctx.fillText(mode === "earth" ? "북극" : mode === "horizon" ? "천정" : "천구 북극", top.x, top.y - 10 * ratio);
        ctx.fillText(mode === "earth" ? "남극" : mode === "horizon" ? "천저" : "천구 남극", bottom.x, bottom.y + 18 * ratio);
        if (mode === "horizon") {
          [[0,"북점"],[90,"동점"],[180,"남점"],[270,"서점"]].forEach(([a,label])=>{ const p=project(a as number,0); if(p.z>-.05) ctx.fillText(label as string,p.x,p.y+17*ratio); });
        }
      }

      const pointA = mode === "equatorial" ? point.a * 15 : point.a;
      const marker = project(pointA, point.b);
      if (marker.z >= -0.02) {
        ctx.fillStyle = "rgba(231,93,72,.22)"; ctx.beginPath(); ctx.arc(marker.x, marker.y, 13 * ratio, 0, TAU); ctx.fill();
        ctx.fillStyle = "#e65d48"; ctx.strokeStyle = "white"; ctx.lineWidth = 3 * ratio; ctx.beginPath(); ctx.arc(marker.x, marker.y, 6.5 * ratio, 0, TAU); ctx.fill(); ctx.stroke();
        if (showLabels && pointLabel) {
          const values = mode === "earth" ? `${formatLon(point.a)}, ${formatLat(point.b)}` : mode === "horizon" ? `${formatAz(point.a)}, ${formatAlt(point.b)}` : `${formatRa(point.a)}, ${formatLat(point.b).replace("N","+").replace("S","−")}`;
          ctx.font = `700 ${12 * ratio}px Arial, sans-serif`; ctx.textAlign = "left";
          const text = hidePointValues ? pointLabel : `${pointLabel} · ${values}`;
          const tw = ctx.measureText(text).width;
          const tx = clamp(marker.x + 13 * ratio, 7 * ratio, w - tw - 17 * ratio);
          const ty = clamp(marker.y - 12 * ratio, 22 * ratio, h - 12 * ratio);
          ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect(tx - 6 * ratio, ty - 14 * ratio, tw + 12 * ratio, 21 * ratio);
          ctx.fillStyle = "#274653"; ctx.fillText(text, tx, ty);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    return () => { running = false; cancelAnimationFrame(frame); observer.disconnect(); };
  }, [mode, point.a, point.b, showGrid, showLabels, autoRotate, pointLabel, hidePointValues]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    viewRef.current.yaw += (event.clientX - drag.x) * 0.008;
    viewRef.current.pitch = clamp(viewRef.current.pitch + (event.clientY - drag.y) * 0.008, -1.2, 1.2);
    drag.x = event.clientX; drag.y = event.clientY;
  };
  const stopDrag = () => { dragRef.current = null; };
  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    viewRef.current.zoom = clamp(viewRef.current.zoom - event.deltaY * 0.001, 0.72, 1.22);
  };

  return <canvas ref={canvasRef} className="sphere-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onWheel={onWheel} aria-label="마우스와 터치로 회전·확대할 수 있는 3차원 좌표 구" />;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <div className="toggle-row"><span>{label}</span><button type="button" className={value ? "switch on" : "switch"} role="switch" aria-checked={value} onClick={() => onChange(!value)}><i /></button></div>;
}

function Slider({ label, value, min, max, step = 1, display, onChange }: { label: string; value: number; min: number; max: number; step?: number; display: string; onChange: (value: number) => void }) {
  return <label className="slider-control"><span>{label}</span><output>{display}</output><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

const Stage = ({ children, modeLabel, helper, legend }: { children: React.ReactNode; modeLabel: string; helper: string; legend: React.ReactNode }) => (
  <div className="stage-card">
    <div className="stage-toolbar"><span>{helper}</span><strong>{modeLabel}</strong></div>
    <div className="canvas-wrap">{children}<div className="gesture-tip">드래그 회전 · 휠/핀치 확대</div></div>
    <div className="concept-strip">{legend}</div>
  </div>
);

const Presets = ({ items, onSelect }: { items: string[]; onSelect: (index: number) => void }) => <div className="preset-grid">{items.map((item, index) => <button type="button" key={item} onClick={() => onSelect(index)}>{item}</button>)}</div>;

function EarthLab() {
  const [lon, setLon] = useState(127);
  const [lat, setLat] = useState(37.5);
  const [labels, setLabels] = useState(true);
  const [grid, setGrid] = useState(true);
  const [playing, setPlaying] = useState(false);
  const presets = [{n:"서울",a:127,b:37.5},{n:"그리니치",a:0,b:51.5},{n:"키토",a:-78.5,b:0},{n:"시드니",a:151.2,b:-33.9}];
  const reset = () => { setLon(127); setLat(37.5); setLabels(true); setGrid(true); setPlaying(false); };
  return <LabLayout kicker="01 · EARTH COORDINATES" title="지구의 경도·위도" description="본초 자오선과 적도를 기준으로 지구상의 위치를 표현합니다." readoutLabel="현재 위치" readout={`${formatLon(lon)} · ${formatLat(lat)}`}>
    <Control title="관측 위치" onReset={reset}>
      <Slider label="경도" value={lon} min={-180} max={180} step={0.5} display={formatLon(lon)} onChange={setLon} />
      <Slider label="위도" value={lat} min={-90} max={90} step={0.5} display={formatLat(lat)} onChange={setLat} />
      <ControlSection label="대표 위치"><Presets items={presets.map((p)=>p.n)} onSelect={(i)=>{setLon(presets[i].a);setLat(presets[i].b);}} /></ControlSection>
      <Toggle label="명칭 표시" value={labels} onChange={setLabels} /><Toggle label="기준선 표시" value={grid} onChange={setGrid} />
      <button className={playing ? "primary-button pause" : "primary-button"} onClick={()=>setPlaying(!playing)}>{playing ? "Ⅱ 회전 멈춤" : "▶ 지구본 자동 회전"}</button>
    </Control>
    <Stage modeLabel="3D EARTH" helper="점의 위치를 바꾸고 지구본을 직접 돌려 보세요." legend={<><span><i className="legend-line amber"/>경도</span><span><i className="legend-line green"/>위도</span><p><b>경도</b>는 본초 자오선, <b>위도</b>는 적도를 기준으로 측정합니다.</p></>}><SphereCanvas mode="earth" point={{a:lon,b:lat}} showGrid={grid} showLabels={labels} autoRotate={playing} pointLabel="선택 지점" /></Stage>
  </LabLayout>;
}

function horizonAt(time: number, dec: number) {
  const phi = rad(37.5); const delta = rad(dec); const hour = rad((time - 12) * 15);
  const sinH = Math.sin(phi)*Math.sin(delta)+Math.cos(phi)*Math.cos(delta)*Math.cos(hour);
  const alt = Math.asin(clamp(sinH,-1,1));
  const cosAlt = Math.max(Math.cos(alt), 0.0001);
  const sinAz = (-Math.cos(delta)*Math.sin(hour))/cosAlt;
  const cosAz = (Math.sin(delta)-Math.sin(alt)*Math.sin(phi))/(cosAlt*Math.cos(phi));
  return { az: wrap((Math.atan2(sinAz,cosAz)*180)/Math.PI,360), alt: (alt*180)/Math.PI };
}

function HorizonLab() {
  const [az, setAz] = useState(135);
  const [alt, setAlt] = useState(35);
  const [time, setTime] = useState(9);
  const [dec, setDec] = useState(20);
  const [labels, setLabels] = useState(true);
  const [grid, setGrid] = useState(true);
  const [playing, setPlaying] = useState(false);
  const applyTime = (nextTime:number,nextDec=dec)=>{const pos=horizonAt(nextTime,nextDec);setTime(wrap(nextTime,24));setAz(pos.az);setAlt(pos.alt);};
  useEffect(()=>{if(!playing)return;const id=window.setInterval(()=>setTime((current)=>{const next=wrap(current+.08,24);const pos=horizonAt(next,dec);setAz(pos.az);setAlt(pos.alt);return next;}),60);return()=>clearInterval(id);},[playing,dec]);
  const presets=[{n:"동쪽에서 뜨기",t:6,d:0},{n:"남중",t:12,d:20},{n:"서쪽으로 지기",t:18,d:0},{n:"주극성",t:2,d:70}];
  const reset=()=>{setAz(135);setAlt(35);setTime(9);setDec(20);setLabels(true);setGrid(true);setPlaying(false);};
  return <LabLayout kicker="02 · HORIZONTAL SYSTEM" title="지평 좌표계" description="관측자의 지평선과 북점을 기준으로 천체의 위치를 나타냅니다." readoutLabel="현재 천체 위치" readout={`방위각 ${formatAz(az)} · 고도 ${formatAlt(alt)}`}>
    <Control title="천체 위치" onReset={reset}>
      <Slider label="방위각 A" value={az} min={0} max={360} display={formatAz(az)} onChange={setAz}/><Slider label="고도 h" value={alt} min={-90} max={90} display={formatAlt(alt)} onChange={setAlt}/>
      <Slider label="시각" value={time} min={0} max={24} step={0.1} display={`${Math.floor(time)}시 ${String(Math.round((time%1)*60)).padStart(2,"0")}분`} onChange={(v)=>applyTime(v)}/>
      <ControlSection label="일주 운동 프리셋"><Presets items={presets.map((p)=>p.n)} onSelect={(i)=>{setDec(presets[i].d);applyTime(presets[i].t,presets[i].d);}} /></ControlSection>
      <Toggle label="명칭 표시" value={labels} onChange={setLabels}/><Toggle label="기준선 표시" value={grid} onChange={setGrid}/>
      <button className={playing?"primary-button pause":"primary-button"} onClick={()=>setPlaying(!playing)}>{playing?"Ⅱ 일주 운동 멈춤":"▶ 일주 운동 재생"}</button>
    </Control>
    <Stage modeLabel="LOCAL SKY" helper="시간을 재생하면 방위각과 고도가 함께 변합니다." legend={<><span><i className="legend-line orange"/>지평선</span><span><i className="legend-dot"/>천체</span><p><b>방위각</b>은 북점에서 시계 방향, <b>고도</b>는 지평선에서 위쪽으로 잽니다.</p></>}><SphereCanvas mode="horizon" point={{a:az,b:alt}} showGrid={grid} showLabels={labels} pointLabel="천체 S" /></Stage>
  </LabLayout>;
}

function EquatorialLab() {
  const [ra,setRa]=useState(5.93); const [dec,setDec]=useState(7.4); const [labels,setLabels]=useState(true); const [grid,setGrid]=useState(true); const [playing,setPlaying]=useState(false); const [name,setName]=useState("베텔게우스");
  const presets=[{n:"베텔게우스",a:5.93,b:7.4},{n:"시리우스",a:6.75,b:-16.7},{n:"북극성",a:2.52,b:89.3},{n:"베가",a:18.62,b:38.8}];
  const reset=()=>{setRa(5.93);setDec(7.4);setLabels(true);setGrid(true);setPlaying(false);setName("베텔게우스");};
  return <LabLayout kicker="03 · EQUATORIAL SYSTEM" title="적도 좌표계" description="춘분점과 천구 적도를 기준으로 천체의 고유한 위치를 표현합니다." readoutLabel="현재 천체 좌표" readout={`적경 ${formatRa(ra)} · 적위 ${dec>=0?"+":""}${dec.toFixed(1)}°`}>
    <Control title="천체 좌표" onReset={reset}>
      <Slider label="적경 α" value={ra} min={0} max={24} step={0.05} display={formatRa(ra)} onChange={(v)=>{setRa(v);setName("천체 S");}}/><Slider label="적위 δ" value={dec} min={-90} max={90} step={0.5} display={`${dec>=0?"+":""}${dec.toFixed(1)}°`} onChange={(v)=>{setDec(v);setName("천체 S");}}/>
      <ControlSection label="대표 천체"><Presets items={presets.map((p)=>p.n)} onSelect={(i)=>{setRa(presets[i].a);setDec(presets[i].b);setName(presets[i].n);}} /></ControlSection>
      <Toggle label="명칭 표시" value={labels} onChange={setLabels}/><Toggle label="기준선 표시" value={grid} onChange={setGrid}/>
      <button className={playing?"primary-button pause":"primary-button"} onClick={()=>setPlaying(!playing)}>{playing?"Ⅱ 천구 회전 멈춤":"▶ 천구 자동 회전"}</button>
    </Control>
    <Stage modeLabel="CELESTIAL SPHERE" helper="천구가 회전해도 천체의 적경·적위 값은 유지됩니다." legend={<><span><i className="legend-line red"/>천구 적도</span><span><i className="legend-line blue"/>시간권</span><p><b>적경</b>은 춘분점부터 동쪽으로, <b>적위</b>는 천구 적도에서 남북으로 잽니다.</p></>}><SphereCanvas mode="equatorial" point={{a:ra,b:dec}} showGrid={grid} showLabels={labels} autoRotate={playing} pointLabel={name}/></Stage>
  </LabLayout>;
}

type Difficulty="기초"|"보통"|"도전";
type Question={mode:Mode;title:string;prompt:string;a:number;b:number;unitA:string;unitB:string;labelA:string;labelB:string};
function makeQuestion(difficulty:Difficulty,forced?:Mode):Question{
  const modes:Mode[]=["earth","horizon","equatorial"];const mode=forced??modes[Math.floor(Math.random()*modes.length)];const step=difficulty==="기초"?10:difficulty==="보통"?5:1;
  if(mode==="earth"){const a=(Math.floor(Math.random()*35)-17)*step;const b=(Math.floor(Math.random()*Math.floor(160/step))-Math.floor(80/step))*step;return{mode,title:"경도·위도 읽기",prompt:"붉은 점의 경도와 위도를 읽어 보세요.",a:clamp(a,-180,180),b:clamp(b,-80,80),unitA:"°",unitB:"°",labelA:"경도 (동경 +, 서경 −)",labelB:"위도 (북위 +, 남위 −)"};}
  if(mode==="horizon"){const a=Math.floor(Math.random()*(360/step))*step;const b=(Math.floor(Math.random()*(90/step)))*step;return{mode,title:"방위각·고도 읽기",prompt:"북점을 기준으로 천체의 방위각과 고도를 읽어 보세요.",a,b,unitA:"°",unitB:"°",labelA:"방위각",labelB:"고도"};}
  const raStep=difficulty==="기초"?2:difficulty==="보통"?1:.5;const a=Math.floor(Math.random()*(24/raStep))*raStep;const b=(Math.floor(Math.random()*(160/step))-Math.floor(80/step))*step;return{mode,title:"적경·적위 읽기",prompt:"춘분점과 천구 적도를 기준으로 좌표를 읽어 보세요.",a,b:clamp(b,-80,80),unitA:"h",unitB:"°",labelA:"적경",labelB:"적위 (북쪽 +, 남쪽 −)"};
}

function PracticeLab(){
  const [difficulty,setDifficulty]=useState<Difficulty>("기초");const [question,setQuestion]=useState<Question>(()=>makeQuestion("기초","earth"));const [answerA,setAnswerA]=useState("");const [answerB,setAnswerB]=useState("");const [result,setResult]=useState<"idle"|"correct"|"wrong">("idle");
  const newQuestion=(next=difficulty)=>{setQuestion(makeQuestion(next));setAnswerA("");setAnswerB("");setResult("idle");};
  const check=()=>{if(answerA===""||answerB==="")return;const tolerance=difficulty==="기초"?2:difficulty==="보통"?1:.51;const da=question.mode==="equatorial"?Math.min(Math.abs(Number(answerA)-question.a),24-Math.abs(Number(answerA)-question.a)):question.mode==="horizon"?Math.min(Math.abs(Number(answerA)-question.a),360-Math.abs(Number(answerA)-question.a)):Math.abs(Number(answerA)-question.a);setResult(da<=tolerance&&Math.abs(Number(answerB)-question.b)<=tolerance?"correct":"wrong");};
  const answerText=question.mode==="earth"?`${formatLon(question.a)}, ${formatLat(question.b)}`:question.mode==="horizon"?`방위각 ${formatAz(question.a)}, 고도 ${formatAlt(question.b)}`:`적경 ${formatRa(question.a)}, 적위 ${question.b>=0?"+":""}${question.b}°`;
  return <div className="practice-page"><section className="lesson-intro"><div><p className="section-kicker">04 · PRACTICE</p><h2>좌표 읽기 연습</h2><p>그림 속 천체의 위치를 읽고 좌표를 직접 입력해 보세요.</p></div><div className="difficulty" aria-label="난이도 선택">{(["기초","보통","도전"] as Difficulty[]).map((level)=><button className={difficulty===level?"active":""} key={level} onClick={()=>{setDifficulty(level);newQuestion(level);}}>{level}</button>)}</div></section>
    <div className="practice-grid"><div className="question-card"><div className="question-number">문제</div><h3>{question.title}</h3><p>{question.prompt}</p><div className="practice-canvas"><SphereCanvas mode={question.mode} point={{a:question.a,b:question.b}} showGrid showLabels pointLabel="천체 S" hidePointValues/></div></div>
    <aside className="answer-card"><div className="answer-head"><span>나의 답</span><button onClick={()=>newQuestion()}>새 문제 ↻</button></div><label>{question.labelA}<div><input inputMode="decimal" type="number" value={answerA} onChange={(e)=>{setAnswerA(e.target.value);setResult("idle");}}/><span>{question.unitA}</span></div></label><label>{question.labelB}<div><input inputMode="decimal" type="number" value={answerB} onChange={(e)=>{setAnswerB(e.target.value);setResult("idle");}}/><span>{question.unitB}</span></div></label><button className="check-button" onClick={check} disabled={answerA===""||answerB===""}>정답 확인</button>
      {result!=="idle"&&<div className={result==="correct"?"feedback correct":"feedback wrong"}><strong>{result==="correct"?"정답입니다!":"한 번 더 살펴보세요."}</strong><p>{result==="correct"?"기준선에서 각도를 정확히 읽었습니다.":`정답: ${answerText}`}</p></div>}
      <div className="practice-tip"><b>읽기 도움말</b><p>{question.mode==="earth"?"본초 자오선의 동·서와 적도의 남·북을 먼저 확인하세요.":question.mode==="horizon"?"방위각은 북점에서 시계 방향, 고도는 지평선에서 위로 측정합니다.":"적경은 시간 단위, 적위는 천구 적도에서 남북 각도로 읽습니다."}</p></div>
    </aside></div></div>;
}

function Control({title,onReset,children}:{title:string;onReset:()=>void;children:React.ReactNode}){return <aside className="control-panel"><div className="panel-heading"><div><p>조작 패널</p><h3>{title}</h3></div><button className="reset-button" onClick={onReset}>초기화 ↻</button></div>{children}</aside>;}
function ControlSection({label,children}:{label:string;children:React.ReactNode}){return <div className="control-section"><span>{label}</span>{children}</div>;}
function LabLayout({kicker,title,description,readoutLabel,readout,children}:{kicker:string;title:string;description:string;readoutLabel:string;readout:string;children:React.ReactNode}){return <><section className="lesson-intro"><div><p className="section-kicker">{kicker}</p><h2>{title}</h2><p>{description}</p></div><div className="coordinate-readout"><span>{readoutLabel}</span><strong>{readout}</strong></div></section><section className="lab-grid">{children}</section></>;}

const tabs=[{label:"지구의 경도·위도",short:"지구",icon:"1"},{label:"지평 좌표계",short:"지평",icon:"2"},{label:"적도 좌표계",short:"적도",icon:"3"},{label:"좌표 연습",short:"연습",icon:"4"}];
export default function Home(){const[active,setActive]=useState(0);const content=useMemo(()=>[<EarthLab key="earth"/>,<HorizonLab key="horizon"/>,<EquatorialLab key="equatorial"/>,<PracticeLab key="practice"/>],[]);return <main className="app-shell"><header className="site-header"><div className="brand-mark" aria-hidden>C</div><div><p className="eyebrow">EARTH SCIENCE LAB</p><h1>천구 좌표계 실험실</h1></div><span className="teacher-badge">교사용 수업 도구</span></header><nav className="tab-list" aria-label="좌표계 실험 선택">{tabs.map((tab,index)=><button key={tab.label} className={active===index?"tab active":"tab"} onClick={()=>setActive(index)}><span>{tab.icon}</span><b className="tab-full">{tab.label}</b><b className="tab-short">{tab.short}</b></button>)}</nav>{content[active]}<footer>비상교육 지구과학Ⅱ의 좌표계 개념을 바탕으로 구성한 수업용 시뮬레이션</footer></main>;}
