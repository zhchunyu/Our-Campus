
import numpy as np, wave, os, json, math
from pathlib import Path
SR=48000; DUR=6.0; N=int(SR*DUR)
OUT=Path(r"C:\Users\31967\Desktop\全国人工智能精英算法大赛\春雨工作区\06-竞赛材料\03-演示视频\新版音效"); OUT.mkdir(parents=True,exist_ok=True)
TARGET_PEAK=10**(-17/20)
def env(n,attack=.01,release=.08):
 a=max(1,int(attack*SR)); r=max(1,int(release*SR)); e=np.ones(n); e[:a]=np.linspace(0,1,a,endpoint=False); e[-r:]*=np.linspace(1,0,r); return e
def add_tone(x,t,dur,freqs,amp=.1,attack=.01,release=.1):
 i0=int(t*SR); n=min(int(dur*SR),N-i0)
 if n<=0:return
 tt=np.arange(n)/SR; f=np.asarray(freqs,float); y=sum(np.sin(2*np.pi*ff*tt) for ff in f)/len(f); x[i0:i0+n]+=amp*y*env(n,attack,release)
def add_noise(x,t,dur,amp=.08,lowpass=0,band=False,seed_shift=0):
 i0=int(t*SR); n=min(int(dur*SR),N-i0)
 if n<=0:return
 z=np.random.default_rng(20261008+seed_shift).normal(0,1,n)
 if lowpass>0:
  alpha=min(.999,max(.001,2*np.pi*lowpass/SR)); y=np.empty(n); y[0]=z[0]*alpha
  for k in range(1,n): y[k]=y[k-1]+alpha*(z[k]-y[k-1])
  z=y
 elif band:z=np.concatenate([[z[0]],np.diff(z)])
 z/=max(1e-9,np.max(np.abs(z))); x[i0:i0+n]+=amp*z*env(n,min(.05,dur/5),min(.16,dur/3))
def add_click(x,t,amp=.08,f=1700,dur=.08):add_tone(x,t,dur,[f,f*1.42],amp,.002,min(.06,dur/2))
def add_footstep(x,t,amp=.085,seed_shift=0):
 add_noise(x,t,.20,amp*.55,lowpass=320,seed_shift=seed_shift); add_tone(x,t+.012,.13,[82,123],amp*.75,.003,.10); add_noise(x,t+.018,.11,amp*.25,band=True,seed_shift=seed_shift+20)
def add_paper(x,t,dur=.58,amp=.07,seed_shift=0):
 add_noise(x,t,dur,amp,lowpass=2600,seed_shift=seed_shift); i0=int(t*SR); n=min(int(dur*SR),N-i0)
 if n>0:
  tt=np.arange(n)/SR; x[i0:i0+n]+=amp*.22*np.sin(2*np.pi*(480+900*tt/dur)*tt)*env(n,.03,.18)
def render(name,builder):
 x=np.zeros(N); builder(x); peak=max(1e-12,float(np.max(np.abs(x)))); x*=TARGET_PEAK/peak; pcm=np.int16(np.clip(x,-1,1)*32767); p=OUT/f"{name}.wav"
 with wave.open(str(p),"wb") as w:w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
 return {"name":name,"path":str(p),"peak_dbfs":20*math.log10(float(np.max(np.abs(pcm))/32767.0)),"peak_linear":float(np.max(np.abs(pcm))/32767.0)}
def a01(x):add_paper(x,.12,.58,.08,1);add_tone(x,1.00,.62,[392,523.25],.075,.02,.2);add_tone(x,1.44,.70,[440,587.33],.073,.02,.22);add_tone(x,4.16,.95,[523.25,659.26,783.99],.045,.03,.42)
def a02(x):add_footstep(x,.28,.09,2);add_footstep(x,1.02,.085,3)
def a03(x):add_tone(x,.28,.38,[523.25,659.26],.065,.006,.18);add_tone(x,1.58,.42,[392,493.88],.057,.006,.2);add_tone(x,2.88,.46,[329.63,415.3],.052,.006,.22)
def a04(x):add_noise(x,2.48,.42,.08,lowpass=3400,seed_shift=4);add_click(x,3.42,.065,1450,.075)
def a05(x):add_click(x,1.15,.065,1500,.065);add_click(x,2.42,.06,1750,.065);add_click(x,3.72,.055,1950,.065)
def a06(x):add_paper(x,1.00,.76,.085,6)
def a07(x):add_click(x,1.15,.06,1450,.07);add_click(x,2.36,.056,1730,.07);add_click(x,3.55,.052,1960,.07)
def a08(x):add_paper(x,1.04,.47,.065,8);add_paper(x,2.00,.47,.062,9);add_paper(x,3.00,.50,.06,10);add_click(x,4.16,.055,1280,.09)
def a09(x):add_tone(x,1.52,.88,[261.63,392],.058,.03,.3);add_tone(x,2.72,1.18,[293.66,392],.052,.03,.62)
def a10(x):add_click(x,3.82,.085,980,.11);add_tone(x,3.82,.28,[196],.018,.002,.16)
def a11(x):add_footstep(x,4.02,.095,11)
def a12(x):add_tone(x,1.72,.45,[261.63],.045,.02,.16);add_tone(x,2.48,.48,[293.66],.047,.02,.18);add_tone(x,3.60,.52,[329.63],.049,.02,.2);add_tone(x,4.40,.82,[329.63,440],.05,.025,.42)
def a13(x):add_tone(x,1.08,.58,[392],.045,.025,.22);add_tone(x,4.12,1.42,[523.25,659.26],.05,.04,.82);add_noise(x,2.42,1.32,.012,lowpass=1800,seed_shift=13)
builders={"A01":a01,"A02":a02,"A03":a03,"A04":a04,"A05":a05,"A06":a06,"A07":a07,"A08":a08,"A09":a09,"A10":a10,"A11":a11,"A12":a12,"A13":a13}
manifest=[render(k,v) for k,v in builders.items()]
(OUT/"manifest.json").write_text(json.dumps({"sample_rate":SR,"channels":1,"bit_depth":16,"duration_sec":DUR,"target_peak_dbfs":"<= -17 dBFS","synthesis_note":"原创合成：正弦音、包络噪声、简单双极滤波；脚步/纸声为短噪声近似，不是真实录音。","files":manifest},ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(manifest,ensure_ascii=False,indent=2))

