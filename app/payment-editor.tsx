"use client";

import { CreditCard, Plus, ScanBarcode, Trash2, CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type PaymentMethod = "cash" | "transfer" | "card";
export type PaymentPayload = { method:PaymentMethod;amount:number;receivedAmount?:number;reference?:string };
type Draft = { method:PaymentMethod;amount:string;received:string;reference:string };

const methods:Array<{id:PaymentMethod;label:string;icon:typeof CircleDollarSign}>=[
  {id:"cash",label:"เงินสด",icon:CircleDollarSign},
  {id:"transfer",label:"QR / โอน",icon:ScanBarcode},
  {id:"card",label:"บัตร/โครงการรัฐ",icon:CreditCard},
];
const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const format=(value:number)=>value.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2});

export function PaymentEditor({total,onChange}:{total:number;onChange:(payments:PaymentPayload[],valid:boolean)=>void}){
  const [split,setSplit]=useState(false);
  const [singleMethod,setSingleMethod]=useState<PaymentMethod>("cash");
  const [singleReceived,setSingleReceived]=useState(String(Math.ceil(total/100)*100));
  const [singleReference,setSingleReference]=useState("");
  const [rows,setRows]=useState<Draft[]>([{method:"cash",amount:"",received:"",reference:""}]);
  const allocated=useMemo(()=>round(rows.reduce((sum,row)=>sum+(Number(row.amount)||0),0)),[rows]);
  const remaining=round(total-allocated);

  useEffect(()=>{if(!split)setSingleReceived(String(Math.ceil(total/100)*100))},[split,total]);

  const result=useMemo(()=>{
    if(!Number.isFinite(total)||total<=0)return{payments:[] as PaymentPayload[],valid:false};
    if(!split){
      const received=Number(singleReceived);
      const payment:PaymentPayload={method:singleMethod,amount:round(total)};
      if(singleMethod==="cash")payment.receivedAmount=received;
      else payment.reference=singleReference.trim();
      return{payments:[payment],valid:singleMethod!=="cash"||(Number.isFinite(received)&&received>=total)};
    }
    const payments=rows.map(row=>{const payment:PaymentPayload={method:row.method,amount:Number(row.amount)};if(row.method==="cash")payment.receivedAmount=Number(row.received);else payment.reference=row.reference.trim();return payment});
    const unique=new Set(rows.map(row=>row.method)).size===rows.length;
    const positive=payments.every(payment=>Number.isFinite(payment.amount)&&payment.amount>0);
    const cashValid=payments.every(payment=>payment.method!=="cash"||(Number.isFinite(payment.receivedAmount)&&(payment.receivedAmount??0)>=payment.amount));
    return{payments,valid:unique&&positive&&cashValid&&remaining===0};
  },[remaining,rows,singleMethod,singleReceived,singleReference,split,total]);

  useEffect(()=>onChange(result.payments,result.valid),[onChange,result]);

  function toggle(value:boolean){setSplit(value);if(value)setRows([{method:singleMethod,amount:"",received:"",reference:""}]);}
  function update(index:number,patch:Partial<Draft>){setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  function add(method:PaymentMethod){setRows(current=>[...current,{method,amount:remaining>0?String(remaining):"",received:"",reference:""}]);}
  const unused=methods.filter(method=>!rows.some(row=>row.method===method.id));

  return <div className="split-payment-editor">
    <label className="split-payment-toggle"><span><strong>แบ่งชำระหลายช่องทาง</strong><small>เช่น เงินสดร่วมกับ QR / โอน</small></span><input type="checkbox" checked={split} onChange={event=>toggle(event.target.checked)}/><i/></label>
    {!split?<><p className="field-label">เลือกวิธีชำระเงิน</p><div className="payment-methods">{methods.map(({id,label,icon:Icon})=><button type="button" className={singleMethod===id?"active":""} onClick={()=>setSingleMethod(id)} key={id}><Icon size={23}/><strong>{label}</strong></button>)}</div>{singleMethod==="cash"?<><label className="field-label" htmlFor="single-received">รับเงินมา</label><div className="money-input"><span>฿</span><input autoFocus onFocus={event=>event.currentTarget.select()} id="single-received" type="number" min={total} step="0.01" value={singleReceived} onChange={event=>setSingleReceived(event.target.value)}/></div><div className="cash-chips">{[total,Math.ceil(total/100)*100,500,1000].filter((value,index,all)=>value>=total&&all.indexOf(value)===index).map(value=><button type="button" onClick={()=>setSingleReceived(String(value))} key={value}>฿{format(value)}</button>)}</div><div className="change-row"><span>เงินทอน</span><strong>฿{format(Math.max(0,(Number(singleReceived)||0)-total))}</strong></div></>:<label className="payment-reference"><span>เลขอ้างอิง (ไม่บังคับ)</span><input autoFocus maxLength={50} value={singleReference} onChange={event=>setSingleReference(event.target.value)}/></label>}</>:<>
      <div className="split-payment-summary"><span>จัดสรรแล้ว <b>฿{format(allocated)}</b></span><span className={remaining<0?"invalid":""}>คงเหลือ <b>฿{format(remaining)}</b></span></div>
      <div className="split-payment-rows">{rows.map((row,index)=>{const meta=methods.find(item=>item.id===row.method)!;const Icon=meta.icon;const cashChange=row.method==="cash"?Math.max(0,(Number(row.received)||0)-(Number(row.amount)||0)):0;return <article key={row.method}><header><span><Icon size={18}/><strong>{meta.label}</strong></span>{rows.length>1&&<button type="button" aria-label={`ลบ ${meta.label}`} onClick={()=>setRows(current=>current.filter((_,i)=>i!==index))}><Trash2 size={15}/></button>}</header><label><span>ยอดชำระ</span><input type="number" min="0.01" step="0.01" value={row.amount} onChange={event=>update(index,{amount:event.target.value})}/></label>{row.method==="cash"?<><label><span>รับเงินมา</span><input type="number" min={row.amount||"0"} step="0.01" value={row.received} onChange={event=>update(index,{received:event.target.value})}/></label><small className="split-change">เงินทอน ฿{format(cashChange)}</small></>:<label><span>เลขอ้างอิง (ไม่บังคับ)</span><input maxLength={50} value={row.reference} onChange={event=>update(index,{reference:event.target.value})}/></label>}</article>})}</div>
      {unused.length>0&&<div className="add-payment-method"><span>เพิ่มช่องทาง</span>{unused.map(({id,label,icon:Icon})=><button type="button" onClick={()=>add(id)} key={id}><Plus size={14}/><Icon size={15}/>{label}</button>)}</div>}
    </>}
  </div>;
}
