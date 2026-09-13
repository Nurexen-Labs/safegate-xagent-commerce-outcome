const $=id=>document.getElementById(id);
const nice=s=>String(s||"").replaceAll("_"," ");
const pct=(n,t)=>t?Math.round(n/t*1000)/10:0;
const cls=s=>/VALIDATED|COMPLETED/.test(s)?"good":/CLAIMED|AMBIGUOUS|ERROR/.test(s)?"warn":"";

function bar(name,count,total){
  const p=pct(count,total);
  return `<div class="bar"><div class="barhead"><span>${nice(name)}</span><span>${count} · ${p}%</span></div><div class="track"><div class="fill" style="width:${Math.max(p,2)}%"></div></div></div>`;
}

async function run(){
  const r=await fetch("/api/analytics",{cache:"no-store"});
  if(!r.ok) throw new Error("Analytics API unavailable");
  const d=await r.json();

  $("kpis").innerHTML=[
    ["Executions",d.kpis.executions,"Evidence events observed"],
    ["CommerceProofs",d.kpis.commerceproofs,"Portable proof references"],
    ["Replay Blocked",d.kpis.replay_blocked,"Duplicate economic use stopped"],
    ["Commerce Verified",d.kpis.commerce_verified,"Only policy-qualified events"]
  ].map(x=>`<div class="kpi"><label>${x[0]}</label><strong>${x[1]}</strong><span>${x[2]}</span></div>`).join("");

  $("volume").innerHTML=d.evidenced_volume.map(x=>`<div class="vol"><div><b>${x.asset}</b><br><span>${x.network} · ${x.rail}</span></div><div><strong>${x.display_value}</strong><br><span>evidence-backed units</span></div></div>`).join("");

  $("actors").innerHTML=Object.entries(d.actor_mix).map(([k,v])=>`<div class="actor"><span>${k}</span><b>${v.percentage}%</b><span>${v.count} events</span></div>`).join("");

  $("assurance").innerHTML=Object.entries(d.assurance_mix).map(([k,v])=>bar(k,v.count,d.kpis.executions)).join("");

  const at=Object.values(d.adapter_distribution).reduce((a,b)=>a+b,0);
  $("adapters").innerHTML=Object.entries(d.adapter_distribution).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(k,v,at)).join("");

  $("outcomes").innerHTML=Object.entries(d.outcome_distribution).map(([k,v])=>`<div class="out"><b>${v}</b><span>${nice(k)}</span></div>`).join("");

  $("latency").innerHTML=`<b>${d.execution_latency.average_ms ?? "—"} ms</b><span>${d.execution_latency.measured_count} measured executions</span>`;

  $("activity").innerHTML=d.recent_activity.map(x=>`<tr>
  <td>${new Date(x.occurred_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</td>
  <td>${nice(x.adapter)}</td>
  <td><span class="pill">${x.actor}</span></td>
  <td><span class="pill ${cls(x.outcome)}">${nice(x.outcome)}</span></td>
  <td><span class="pill ${cls(x.assurance)}">${nice(x.assurance)}</span></td>
  <td>${x.economic?`${x.economic.value} ${x.economic.asset} · ${x.economic.network}`:"—"}</td>
  </tr>`).join("");
}
run();