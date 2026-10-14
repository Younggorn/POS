"use client";

import {
  ArrowDownRight, ArrowUpRight, BarChart3, Bell, Box, Boxes, Check, ChevronDown,
  CalendarClock, CircleDollarSign, ClipboardList, Clock3, CreditCard, FileBarChart, HandCoins,
  KeyRound, LayoutDashboard, LogOut, Menu, Minus, PackageCheck, Plus, Printer, ReceiptText, ScanBarcode, ShieldCheck,
  Search, Settings, ShoppingBag, ShoppingCart, Store, Tag, Trash2, TrendingUp, Truck,
  Pause, Play, ListRestart, SlidersHorizontal, ScrollText, DatabaseBackup,
  UserRound, Users, WalletCards, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CustomerManagement, PurchaseManagement, ReportsManagement, ReturnManagement, ShiftManagement, SystemManagement } from "./management";
import { ShelfLifeManagement } from "./shelf-life";
import { LotPurchaseManagement } from "./purchase-shelf";
import { ProductUnitsManagement } from "./product-units";
import { AccessControlManagement } from "./access-control";
import { OptionsManagement } from "./options-management";
import { CustomerDirectory } from "./customer-directory";
import { LoginLogsManagement } from "./login-logs";
import { BackupManagement } from "./backup-management";
import { PaymentEditor, type PaymentPayload } from "./payment-editor";
import { TaxInvoiceCustomerEditor, type TaxInvoiceBuyer } from "./tax-invoice-customer-editor";

type Product = {
  id: string | number; code: string; name: string; category: string; unit: string;
  price: number; cost: number; stock: number; min: number; color: string; icon: string;
  categoryId?: string | null; alternateName?: string | null; price1?: number; price2?: number;
  price3?: number; price4?: number; max?: number; inactive?: boolean; trackExpiry?: boolean;
  units?: ProductUnit[]; lots?: ProductLot[]; selectedUnitId?: string | null; matchedBarcode?: string | null;
};

type ProductBarcode = { id:string;productUnitId:string;barcode:string;isPrimary:boolean;active:boolean;note:string|null };
type ProductUnit = { id:string;productCode:string;name:string;barcode:string;barcodes?:ProductBarcode[];conversionRate:number;salePrice:number;purchaseCost:number|null;isBase:boolean;canSell:boolean;canPurchase:boolean;active:boolean };
type ProductLot = { id:string;lotNo:string;expireDate:string;quantity:number;daysRemaining:number;promotion?:{type:string;value:number;endsAt:string|null}|null };
type CartLine = Product & { qty: number; cartKey:string;unitId:string|null;unitName:string;conversionRate:number;scannedBarcode:string|null;selectedLot:ProductLot|null };
type SaleResult = { id: string; invoiceNo: string; subtotal: number; vatAmount: number; total: number; soldAt: string };
type AuthUser = { id:number;username:string;name:string;position:string;permissions:string[];mustChangePassword:boolean };
type CustomerChoice = { code:string;name:string;phone:string|null;priceLevel:number };
type HeldBill = { id:number;label:string;itemCount:number;total:number;items:CartLine[];customer:CustomerChoice|null;heldBy:string|null;createdAt:string;updatedAt:string };

const products: Product[] = [
  { id: 1, code: "8850123", name: "น้ำดื่มคริสตัล 600 มล.", category: "เครื่องดื่ม", unit: "ขวด", price: 7, cost: 4.5, stock: 48, min: 12, color: "#dceeff", icon: "💧" },
  { id: 2, code: "8851959", name: "โค้ก ออริจินัล 325 มล.", category: "เครื่องดื่ม", unit: "กระป๋อง", price: 18, cost: 13, stock: 32, min: 10, color: "#ffe5e2", icon: "🥤" },
  { id: 3, code: "8850002", name: "เลย์ รสออริจินัล", category: "ขนม", unit: "ถุง", price: 20, cost: 14, stock: 27, min: 8, color: "#fff0c7", icon: "🍟" },
  { id: 4, code: "8850987", name: "มาม่า รสหมูสับ", category: "อาหารแห้ง", unit: "ซอง", price: 8, cost: 5.25, stock: 64, min: 20, color: "#ffe3cf", icon: "🍜" },
  { id: 5, code: "8851111", name: "นมสดเมจิ รสจืด", category: "นมและโยเกิร์ต", unit: "ขวด", price: 25, cost: 19, stock: 9, min: 10, color: "#e7e6ff", icon: "🥛" },
  { id: 6, code: "8852222", name: "ขนมปังฟาร์มเฮ้าส์", category: "เบเกอรี่", unit: "แถว", price: 42, cost: 34, stock: 6, min: 5, color: "#f7e8d2", icon: "🍞" },
  { id: 7, code: "8853333", name: "ทิชชู่ Cellox 115 แผ่น", category: "ของใช้", unit: "กล่อง", price: 35, cost: 27, stock: 15, min: 6, color: "#e2f5ef", icon: "🧻" },
  { id: 8, code: "8854444", name: "ไข่ไก่ เบอร์ 2 แพ็ก 10 ฟอง", category: "อาหารสด", unit: "แพ็ก", price: 45, cost: 38, stock: 12, min: 8, color: "#fff2dc", icon: "🥚" },
  { id: 9, code: "8855555", name: "โออิชิ กรีนที น้ำผึ้งมะนาว", category: "เครื่องดื่ม", unit: "ขวด", price: 20, cost: 15, stock: 23, min: 8, color: "#e4f4d3", icon: "🍵" },
];

const nav = [
  { id: "pos", label: "ขายสินค้า", icon: ShoppingCart, hot: true },
  { id: "sales", label: "ประวัติการขาย", icon: ReceiptText },
  { id: "products", label: "สินค้าและสต็อก", icon: Boxes },
  { id: "purchase", label: "จัดซื้อและรับเข้า", icon: Truck },
  { id: "shelf-life", label: "Shelf Life / วันหมดอายุ", icon: CalendarClock },
  { id: "product-units", label: "หน่วยสินค้าและ Barcode", icon: Box },
  { id: "returns", label: "คืนสินค้าบางรายการ", icon: PackageCheck },
  { id: "customers", label: "ลูกค้าและลูกหนี้", icon: Users },
  { id: "customer-management", label: "จัดการลูกค้า", icon: UserRound },
  { id: "shifts", label: "กะขายและเงินสด", icon: WalletCards },
  { id: "reports", label: "รายงาน", icon: FileBarChart },
  { id: "dashboard", label: "ภาพรวมร้าน", icon: LayoutDashboard },
  { id: "options", label: "จัดการตัวเลือกต่างๆ", icon: SlidersHorizontal },
  { id: "system", label: "อุปกรณ์และงานระบบ", icon: Settings },
  { id: "access-control", label: "พนักงาน ตำแหน่ง และสิทธิ์", icon: ShieldCheck },
  { id: "login-logs", label: "Logs การ Login", icon: ScrollText },
  { id: "backup", label: "Backup", icon: DatabaseBackup },
];
const LAST_PAGE_STORAGE_KEY = "upminimart.last-page";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function salePriceForCustomer(product:Product,unit:ProductUnit|undefined,customer:CustomerChoice|null){const normal=unit?.salePrice??product.price,level=customer?.priceLevel??0,tier=[product.price,product.price1??0,product.price2??0,product.price3??0,product.price4??0][level]??0;return level>0&&tier>0?tier*(unit?.conversionRate??1):normal}
function salePriceForLot(product:Product,unit:ProductUnit|undefined,customer:CustomerChoice|null,lot:ProductLot|null){const normal=salePriceForCustomer(product,unit,customer);if(!lot?.promotion)return normal;const conversion=unit?.conversionRate??1;const promo=lot.promotion.type==="price"?lot.promotion.value*conversion:normal*(1-lot.promotion.value/100);return Math.max(0,Math.min(normal,promo))}

function LoginScreen({onLogin}:{onLogin:(user:AuthUser)=>void}) {
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setLoading(true);setError("");try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const payload=await response.json();if(!response.ok)throw new Error(payload.message??"เข้าสู่ระบบไม่สำเร็จ");onLogin(payload.user)}catch(cause){setError(cause instanceof Error?cause.message:"เข้าสู่ระบบไม่สำเร็จ");setLoading(false)}}
  return <main className="login-page"><section className="login-card"><div className="login-brand"><div><Store size={31}/></div><span><strong>UP Minimart</strong><small>ระบบบริหารร้านค้า</small></span></div><div className="login-heading"><h1>เข้าสู่ระบบ</h1><p>กรอกบัญชีพนักงานเพื่อเริ่มใช้งาน</p></div><form onSubmit={submit}><label><span>ชื่อผู้ใช้</span><input autoFocus autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} placeholder="เช่น admin"/></label><label><span>รหัสผ่าน</span><div className="login-password"><KeyRound size={18}/><input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="รหัสผ่าน"/></div></label>{error&&<div className="login-error">{error}</div>}<button disabled={loading||!username.trim()||!password}>{loading?"กำลังตรวจสอบ...":"เข้าสู่ระบบ"}</button></form><footer>บัญชีและสิทธิ์ถูกจัดการโดยผู้ดูแลร้าน</footer></section></main>
}

function ChangePasswordScreen({user,onChanged,onLogout}:{user:AuthUser;onChanged:()=>void;onLogout:()=>void}) {
  const[currentPassword,setCurrentPassword]=useState(""),[newPassword,setNewPassword]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();if(newPassword!==confirm){setError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");return}setLoading(true);setError("");try{const response=await fetch("/api/auth/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});const payload=await response.json();if(!response.ok)throw new Error(payload.message??"เปลี่ยนรหัสผ่านไม่สำเร็จ");onChanged()}catch(cause){setError(cause instanceof Error?cause.message:"เปลี่ยนรหัสผ่านไม่สำเร็จ");setLoading(false)}}
  return <main className="login-page"><section className="login-card change-password-card"><div className="login-brand"><div><KeyRound size={28}/></div><span><strong>ตั้งรหัสผ่านใหม่</strong><small>{user.name} · {user.position}</small></span></div><div className="login-heading"><h1>เปลี่ยนรหัสผ่านครั้งแรก</h1><p>ต้องมีอย่างน้อย 8 ตัว และมีทั้งตัวอักษรกับตัวเลข</p></div><form onSubmit={submit}><label><span>รหัสผ่านเดิม</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label><label><span>รหัสผ่านใหม่</span><input type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></label><label><span>ยืนยันรหัสผ่านใหม่</span><input type="password" autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></label>{error&&<div className="login-error">{error}</div>}<button disabled={loading||!currentPassword||newPassword.length<8||!confirm}>{loading?"กำลังบันทึก...":"บันทึกรหัสผ่านใหม่"}</button><button type="button" className="login-secondary" onClick={onLogout}>ออกจากระบบ</button></form></section></main>
}

export default function Home() {
  const [page, setPage] = useState("pos");
  const [sidebar, setSidebar] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paying, setPaying] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [lastSale, setLastSale] = useState<SaleResult | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [completedDocument, setCompletedDocument] = useState<{sale:SaleDetail;shop:ReceiptShop;type:"tax-invoice"}|null>(null);
  const [documentLoading, setDocumentLoading] = useState<"receipt"|"tax-invoice"|null>(null);
  const [authUser,setAuthUser]=useState<AuthUser|null|undefined>(undefined);
  const [heldBillsOpen,setHeldBillsOpen]=useState(false);
  const [heldBillCount,setHeldBillCount]=useState(0);
  const [selectedCustomer,setSelectedCustomer]=useState<CustomerChoice|null>(null);

  useEffect(()=>{fetch("/api/auth/session",{cache:"no-store"}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error();setAuthUser(payload.user)}).catch(()=>setAuthUser(null))},[]);

  useEffect(() => {
    const savedPage = window.localStorage.getItem(LAST_PAGE_STORAGE_KEY);
    if (savedPage && nav.some((item) => item.id === savedPage)) setPage(savedPage);
  }, []);

  useEffect(() => {
    if (window.innerWidth <= 1024) setSidebar(false);
  }, []);

  useEffect(() => {
    if (!authUser) return;
    fetch("/api/held-bills", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setHeldBillCount(Array.isArray(payload.items) ? payload.items.length : 0))
      .catch(() => undefined);
  }, [authUser]);

  useEffect(() => {
    if (!lastSale) return;
    const timer = window.setTimeout(() => setLastSale(null), 5000);
    return () => window.clearTimeout(timer);
  }, [lastSale]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const key = event.key;

      if (key === "Escape" && paying) {
        event.preventDefault();
        setPaying(false);
        return;
      }

      if (key === "F2") {
        event.preventDefault();
        if(page==="pos"&&completedSale){startNewSale();return;}
        navigate("pos");
        return;
      }

      if (key === "F3") {
        event.preventDefault();
        navigate("pos");
        window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-pos-search]")?.focus(), 0);
        return;
      }

      if (key === "F8") {
        event.preventDefault();
        if (event.repeat || page !== "pos" || paying || documentLoading || document.querySelector(".modal-backdrop")) return;
        if (completedSale) startNewSale();
        else if (cart.length > 0) setPaying(true);
        return;
      }

      if (key === "F10") {
        event.preventDefault();
        navigate("shifts");
        return;
      }

      if (event.ctrlKey && key === "Enter") {
        event.preventDefault();
        if (paying) document.querySelector<HTMLButtonElement>(".payment-modal .confirm:not(:disabled)")?.click();
        else if (page === "pos" && cart.length > 0 && !completedSale) setPaying(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [page, cart.length, paying, completedSale, documentLoading]);

  const allowedNav = authUser ? nav.filter((item)=>authUser.permissions.includes(item.id)) : [];
  const effectivePage = allowedNav.some((item)=>item.id===page) ? page : allowedNav[0]?.id ?? "";
  const pageName = allowedNav.find((n) => n.id === effectivePage)?.label ?? "UP Minimart";
  const cartTotal = cart.reduce((sum, p) => sum + p.price * p.qty, 0);

  function add(product: Product, lot: ProductLot|null = null) {
    if(completedSale)return;
    setCart((old) => {
      const selected = product.units?.find((unit) => unit.id === product.selectedUnitId && unit.active && unit.canSell) ?? product.units?.find((unit) => unit.isBase && unit.active && unit.canSell);
      const cartKey = `${product.code}:${selected?.id ?? "base"}:lot-${lot?.id ?? "none"}`;
      const found = old.find((p) => p.cartKey === cartKey);
      const conversion=selected?.conversionRate??1;
      const price=salePriceForLot(product,selected,selectedCustomer,lot);
      return found ? old.map((p) => p.cartKey === cartKey ? { ...p, qty: p.qty + 1 } : p) : [...old, { ...product, price,unit:selected?.name??product.unit,qty:1,cartKey,unitId:selected?.id??null,unitName:selected?.name??product.unit,conversionRate:conversion,scannedBarcode:product.matchedBarcode??(product.selectedUnitId?selected?.barcode??null:null),selectedLot:lot }];
    });
  }

  function qty(id: string|number, delta: number) {
    if(completedSale)return;
    setCart((old) => {
      const target=old.find(line=>line.cartKey===String(id));
      if(!target)return old;
      return old.map((p) => {
      if(p.cartKey !== String(id)) return p;
      if(!Number.isInteger(p.qty + delta)||p.qty + delta > 9999)return p;
      return { ...p, qty: p.qty + delta };
      }).filter((p) => p.qty > 0);
    });
  }

  function changeCartUnit(cartKey:string,unitId:string){
    if(completedSale)return;
    setCart(old=>{const line=old.find(item=>item.cartKey===cartKey);if(!line)return old;const unit=line.units?.find(item=>item.id===unitId&&item.active&&item.canSell);if(!unit)return old;const baseTotal=line.qty*line.conversionRate;let nextQty=baseTotal%unit.conversionRate===0?baseTotal/unit.conversionRate:1;if(nextQty!==line.qty||unit.conversionRate!==line.conversionRate){if(!window.confirm(`เปลี่ยนเป็น ${unit.name} ${nextQty} หน่วย\nระบบจะตัดสต็อก ${nextQty*unit.conversionRate} ${line.units?.find(u=>u.isBase)?.name??line.unit}`))return old;}const nextKey=`${line.code}:${unit.id}:lot-${line.selectedLot?.id??"none"}`;const existing=old.find(item=>item.cartKey===nextKey&&item.cartKey!==cartKey);const without=old.filter(item=>item.cartKey!==cartKey&&item.cartKey!==nextKey);const changed={...line,cartKey:nextKey,unitId:unit.id,unitName:unit.name,unit:unit.name,conversionRate:unit.conversionRate,price:salePriceForLot(line,unit,selectedCustomer,line.selectedLot),qty:nextQty};return existing?[...without,{...existing,qty:existing.qty+nextQty}]:[...without,changed]});
  }

  function changeCartLot(cartKey:string,lot:ProductLot){
    if(completedSale)return;
    setCart(old=>{
      const line=old.find(item=>item.cartKey===cartKey);if(!line)return old;
      const nextKey=`${line.code}:${line.unitId??"base"}:lot-${lot.id}`;
      const existing=old.find(item=>item.cartKey===nextKey&&item.cartKey!==cartKey);
      const without=old.filter(item=>item.cartKey!==cartKey&&item.cartKey!==nextKey);
      if(existing)return [...without,{...existing,qty:existing.qty+line.qty}];
      return [...without,{...line,cartKey:nextKey,selectedLot:lot,price:salePriceForLot(line,line.units?.find(item=>item.id===line.unitId),selectedCustomer,lot)}];
    });
  }

  function chooseCustomer(customer:CustomerChoice|null){if(completedSale)return;setSelectedCustomer(customer);setCart(old=>old.map(line=>{const unit=line.units?.find(item=>item.id===line.unitId);return{...line,price:salePriceForLot(line,unit,customer,line.selectedLot)}}))}

  function navigate(nextPage: string) {
    if(authUser&&!authUser.permissions.includes(nextPage))return;
    setPage(nextPage);
    window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, nextPage);
    if (window.innerWidth <= 1024) setSidebar(false);
  }

  async function loadCompletedSaleDetail() {
    if (!completedSale) throw new Error("ไม่พบบิลที่ชำระแล้ว");
    const response = await fetch(`/api/sales?id=${encodeURIComponent(completedSale.id)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "โหลดรายละเอียดบิลไม่สำเร็จ");
    return payload as {sale:SaleDetail;shop:ReceiptShop};
  }

  async function printCompletedReceipt() {
    if (!completedSale || documentLoading) return;
    setDocumentLoading("receipt");
    try {
      const detail=await loadCompletedSaleDetail();
      const response=await fetch("/api/receipt-print",{method:"POST",headers:{"Content-Type":"application/json; charset=utf-8"},body:JSON.stringify(detail)});
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.message??"ส่งงานพิมพ์ไม่สำเร็จ");
    } catch(cause) {
      window.alert(cause instanceof Error?cause.message:"พิมพ์ใบเสร็จไม่สำเร็จ");
    } finally {
      setDocumentLoading(null);
    }
  }

  async function openCompletedTaxInvoice() {
    if (!completedSale || documentLoading) return;
    setDocumentLoading("tax-invoice");
    try {
      const detail=await loadCompletedSaleDetail();
      setCompletedDocument({...detail,type:"tax-invoice"});
    } catch(cause) {
      window.alert(cause instanceof Error?cause.message:"ออกใบกำกับภาษีไม่สำเร็จ");
    } finally {
      setDocumentLoading(null);
    }
  }

  function startNewSale(){setCart([]);setSelectedCustomer(null);setCompletedSale(null);setLastSale(null);window.setTimeout(()=>document.querySelector<HTMLInputElement>("[data-pos-search]")?.focus(),0)}

  async function logout(){await fetch("/api/auth/logout",{method:"POST"}).catch(()=>undefined);setCart([]);setSelectedCustomer(null);setAuthUser(null)}

  if(authUser===undefined)return <main className="auth-loading"><Store size={35}/><strong>กำลังตรวจสอบการเข้าสู่ระบบ...</strong></main>;
  if(authUser===null)return <LoginScreen onLogin={setAuthUser}/>;
  if(authUser.mustChangePassword)return <ChangePasswordScreen user={authUser} onChanged={()=>setAuthUser({...authUser,mustChangePassword:false})} onLogout={()=>void logout()}/>;

  return (
    <main className={`app-shell ${sidebar ? "" : "sidebar-collapsed"}`}>
      <button className="sidebar-scrim" aria-label="ปิดเมนู" onClick={() => setSidebar(false)}/>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Store size={23} /></div>
          <div className="brand-copy"><strong>UP Minimart</strong><span>ระบบบริหารร้านค้า</span></div>
        </div>

        <button className="new-sale" onClick={() => navigate("pos")}><Zap size={18} fill="currentColor" /><span>เริ่มขายสินค้า</span><kbd>F2</kbd></button>

        <nav className="main-nav">
          <p className="nav-label">เมนูหลัก</p>
          {allowedNav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={effectivePage === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.label}</span>{item.hot && <i>POS</i>}</button>;
          })}
        </nav>
        <button className="sidebar-logout" onClick={()=>{if(window.confirm(`ต้องการออกจากระบบบัญชี ${authUser.name} ใช่หรือไม่?`))void logout()}}><LogOut size={17}/><span>ออกจากระบบ</span></button>
      </aside>

      <section className="workspace">
        <header className={`topbar ${effectivePage === "pos" ? "pos-topbar" : ""}`}>
          <div className="topbar-left"><button className="icon-btn menu-btn" onClick={() => setSidebar(!sidebar)}><Menu size={20} /></button><div><span className="eyebrow">UP MINIMART</span><h1>{pageName}</h1></div></div>
          <div className="topbar-actions">
            <LiveClock />
            <button className="icon-btn notification"><Bell size={20} /><i /></button>
            <div className="profile"><div className="avatar">{authUser.name.slice(0,2).toUpperCase()}</div><div><strong>{authUser.name}</strong><span>{authUser.position}</span></div></div>
          </div>
        </header>

        <div className={`content ${effectivePage === "pos" ? "pos-content" : ""}`}>
          {effectivePage === "dashboard" && <RealDashboard onNewSale={() => navigate("pos")} onOpenSales={() => navigate("sales")} />}
          {effectivePage === "pos" && <OptimizedPOS cart={cart} add={add} qty={qty} changeUnit={changeCartUnit} changeLot={changeCartLot} total={cartTotal} customer={selectedCustomer} onCustomerChange={chooseCustomer} onPay={() => setPaying(true)} onOpenHeld={() => setHeldBillsOpen(true)} heldBillCount={heldBillCount} refreshKey={catalogRevision} completedSale={completedSale} documentLoading={documentLoading} onPrintReceipt={()=>void printCompletedReceipt()} onTaxInvoice={()=>void openCompletedTaxInvoice()} onStartNew={startNewSale} />}
          {effectivePage === "sales" && <SalesHistory />}
          {effectivePage === "products" && <FullProducts />}
          {effectivePage === "product-units" && <ProductUnitsManagement />}
          {effectivePage === "purchase" && <LotPurchaseManagement />}
          {effectivePage === "shelf-life" && <ShelfLifeManagement />}
          {effectivePage === "returns" && <ReturnManagement />}
          {effectivePage === "customers" && <CustomerManagement />}
          {effectivePage === "customer-management" && <CustomerDirectory />}
          {effectivePage === "shifts" && <ShiftManagement />}
          {effectivePage === "reports" && <ReportsManagement />}
          {effectivePage === "options" && <OptionsManagement />}
          {effectivePage === "system" && <SystemManagement />}
          {effectivePage === "access-control" && <AccessControlManagement />}
          {effectivePage === "login-logs" && <LoginLogsManagement />}
          {effectivePage === "backup" && <BackupManagement />}
        </div>
      </section>
      {lastSale && <div className="sale-toast"><Check size={18}/><div><strong>บันทึกการขายสำเร็จ</strong><span>เลขที่บิล {lastSale.invoiceNo} · ฿{money(lastSale.total)}</span></div><button onClick={() => setLastSale(null)}><X size={15}/></button></div>}
      {paying && <RealPayment cart={cart} total={cartTotal} customer={selectedCustomer} onClose={() => setPaying(false)} onSuccess={(sale) => { setPaying(false); setLastSale(sale); setCompletedSale(sale); setCatalogRevision((revision) => revision + 1); }} />}
      {heldBillsOpen && <HeldBillsModal cart={cart} customer={selectedCustomer} onClose={() => setHeldBillsOpen(false)} onHeld={() => { setCart([]); setSelectedCustomer(null); setHeldBillCount((count) => count + 1); }} onRestore={(heldCart,customer) => { setCart(heldCart); setSelectedCustomer(customer); setHeldBillsOpen(false); navigate("pos"); }} onDeleted={() => setHeldBillCount((count) => Math.max(0, count - 1))} />}
      {completedDocument&&<ReceiptModal sale={completedDocument.sale} shop={completedDocument.shop} documentType={completedDocument.type} allowCancel={false} onClose={()=>setCompletedDocument(null)}/>}
    </main>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const dateText = now ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(now) : "--";
  const timeText = now ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(now) : "--:--";
  return <div className="today"><Clock3 size={16}/><span>{dateText}</span><strong>{timeText} น.</strong></div>;
}

type DashboardData = {
  today: { total: number; bills: number; average: number; grossProfit: number; previousTotal: number; trendPercent: number };
  hourly: Array<{ hour: number; label: string; total: number }>;
  lowStock: { count: number; items: Array<{ code: string; name: string; stock: number; min: number; unit: string }> };
  latestSales: Array<{ id: string; invoiceNo: string; customer: string; paymentType: string | null; total: number; soldAt: string | null; itemCount: number }>;
  generatedAt: string;
};

function RealDashboard({ onNewSale, onOpenSales }: { onNewSale: () => void; onOpenSales: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/dashboard", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setData(payload))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("โหลดข้อมูล Dashboard ไม่สำเร็จ");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  if (!data && loading) return <div className="dashboard-state"><span>กำลังคำนวณข้อมูลร้าน...</span></div>;
  if (!data) return <div className="dashboard-state"><span>{error}</span><button className="primary" onClick={() => setRevision((current) => current + 1)}>ลองใหม่</button></div>;

  const maxHourly = Math.max(...data.hourly.map((item) => item.total), 1);
  const trendDown = data.today.trendPercent < 0;
  const trend = `${Math.abs(data.today.trendPercent).toLocaleString("th-TH", { maximumFractionDigits: 1 })}% จากเมื่อวาน`;
  const saleTime = (value: string | null) => value ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "-";
  const paymentName = (value: string | null) => ({ C: "เงินสด", T: "QR / โอน", D: "บัตร/โครงการรัฐ", M: "หลายช่องทาง" }[value ?? ""] ?? "ไม่ระบุ");

  return <>
    <div className="welcome-row"><div><h2>ภาพรวมร้านวันนี้</h2><p>ข้อมูลจริงจาก PostgreSQL · อัปเดต {saleTime(data.generatedAt)} น.</p></div><div className="dashboard-actions"><button className="outline-button" disabled={loading} onClick={() => setRevision((current) => current + 1)}>รีเฟรช</button><button className="primary" onClick={onNewSale}><ShoppingCart size={18}/>ขายสินค้าใหม่</button></div></div>
    {error && <div className="data-message warning-message">{error}</div>}
    <div className="metric-grid">
      <Metric label="ยอดขายวันนี้" value={`฿${money(data.today.total)}`} trend={trend} trendDown={trendDown} icon={CircleDollarSign} color="green" />
      <Metric label="จำนวนบิล" value={data.today.bills.toLocaleString("th-TH")} sub={`เฉลี่ย ฿${money(data.today.average)} / บิล`} icon={ReceiptText} color="blue" />
      <Metric label="กำไรขั้นต้น" value={`฿${money(data.today.grossProfit)}`} sub="คำนวณจากราคาขายหักต้นทุน" icon={TrendingUp} color="purple" />
      <Metric label="สินค้าใกล้หมด" value={`${data.lowStock.count.toLocaleString("th-TH")} รายการ`} sub="ต่ำกว่าหรือเท่ากับจุดสั่งซื้อ" icon={Box} color="orange" warning={data.lowStock.count > 0} />
    </div>
    <div className="dashboard-grid">
      <section className="panel sales-panel"><div className="panel-head"><div><h3>ยอดขายรายชั่วโมง</h3><p>เฉพาะบิลที่ไม่ถูกยกเลิกตามเวลาไทย</p></div><button className="select-button">วันนี้</button></div><div className="chart-summary"><strong>฿{money(data.today.total)}</strong><span className={trendDown ? "trend-down" : ""}>{trendDown ? <ArrowDownRight size={14}/> : <ArrowUpRight size={14}/>} {trend}</span></div><div className="bar-chart">{data.hourly.map((item) => <div className="bar-wrap" key={item.hour}><div className="bar" style={{ height: `${Math.max(item.total / maxHourly * 100, item.total > 0 ? 4 : 0)}%` }}><span>฿{money(item.total)}</span></div><small>{item.label}</small></div>)}</div></section>
      <section className="panel quick-panel"><div className="panel-head"><div><h3>เมนูลัด</h3><p>งานที่ใช้งานบ่อย</p></div></div><div className="quick-grid"><Quick icon={ShoppingCart} label="ขายสินค้า" color="green" onClick={onNewSale}/><Quick icon={ReceiptText} label="ประวัติการขาย" color="blue" onClick={onOpenSales}/><Quick icon={PackageCheck} label="รับสินค้า" color="purple"/><Quick icon={HandCoins} label="รับชำระหนี้" color="orange"/></div></section>
    </div>
    <div className="bottom-grid">
      <section className="panel low-stock"><div className="panel-head"><div><h3>สินค้าใกล้หมด</h3><p>สินค้าที่ถึงจุดสั่งซื้อ</p></div><span className="dashboard-count">{data.lowStock.count.toLocaleString("th-TH")} รายการ</span></div>{data.lowStock.items.length === 0 ? <div className="dashboard-empty">ไม่มีสินค้าใกล้หมด</div> : data.lowStock.items.map((product) => <div className="stock-row" key={product.code}><div className="product-emoji dashboard-box"><Box size={18}/></div><div className="stock-name"><strong>{product.name}</strong><span>{product.code}</span></div><div className="stock-count"><strong className="danger">{product.stock.toLocaleString("th-TH")} {product.unit}</strong><span>ขั้นต่ำ {product.min.toLocaleString("th-TH")}</span></div></div>)}</section>
      <section className="panel transactions"><div className="panel-head"><div><h3>รายการขายล่าสุด</h3><p>บิลจริงที่ไม่ถูกยกเลิก</p></div><button className="text-button" onClick={onOpenSales}>ดูทั้งหมด</button></div>{data.latestSales.length === 0 ? <div className="dashboard-empty">ยังไม่มีรายการขาย</div> : data.latestSales.map((sale) => <div className="transaction-row" key={sale.id}><div className="receipt-icon"><ReceiptText size={18}/></div><div><strong>{sale.invoiceNo}</strong><span>{sale.customer} · {saleTime(sale.soldAt)} น. · {sale.itemCount} รายการ</span></div><b>฿{money(sale.total)}</b><em>{paymentName(sale.paymentType)}</em></div>)}</section>
    </div>
  </>;
}

function Dashboard({ onNewSale }: { onNewSale: () => void }) {
  const bars = [38, 46, 35, 62, 52, 72, 66, 84, 61, 78, 70, 94];
  return <>
    <div className="welcome-row"><div><h2>สวัสดีตอนบ่าย, แอดมิน 👋</h2><p>นี่คือภาพรวมการดำเนินงานของร้านในวันนี้</p></div><button className="primary" onClick={onNewSale}><ShoppingCart size={18} />ขายสินค้าใหม่</button></div>
    <div className="metric-grid">
      <Metric label="ยอดขายวันนี้" value="฿24,580.00" trend="12.5%" icon={CircleDollarSign} color="green" />
      <Metric label="จำนวนบิล" value="128" sub="เฉลี่ย ฿192 / บิล" icon={ReceiptText} color="blue" />
      <Metric label="กำไรขั้นต้น" value="฿7,862.40" trend="8.2%" icon={TrendingUp} color="purple" />
      <Metric label="สินค้าใกล้หมด" value="6 รายการ" sub="ควรสั่งซื้อเพิ่มเติม" icon={Box} color="orange" warning />
    </div>
    <div className="dashboard-grid">
      <section className="panel sales-panel">
        <div className="panel-head"><div><h3>ภาพรวมยอดขาย</h3><p>เปรียบเทียบยอดขายรายชั่วโมงวันนี้</p></div><button className="select-button">วันนี้ <ChevronDown size={15} /></button></div>
        <div className="chart-summary"><strong>฿24,580</strong><span><ArrowUpRight size={14} /> 12.5% จากเมื่อวาน</span></div>
        <div className="bar-chart">{bars.map((v, i) => <div className="bar-wrap" key={i}><div className="bar" style={{ height: `${v}%` }}><span>฿{(v * 32).toLocaleString()}</span></div><small>{8 + i}:00</small></div>)}</div>
      </section>
      <section className="panel quick-panel"><div className="panel-head"><div><h3>เมนูลัด</h3><p>งานที่ใช้งานบ่อย</p></div></div><div className="quick-grid">
        <Quick icon={ShoppingCart} label="ขายสินค้า" color="green" onClick={onNewSale} />
        <Quick icon={PackageCheck} label="รับสินค้า" color="blue" />
        <Quick icon={ScanBarcode} label="พิมพ์บาร์โค้ด" color="purple" />
        <Quick icon={HandCoins} label="รับชำระหนี้" color="orange" />
      </div></section>
    </div>
    <div className="bottom-grid">
      <section className="panel low-stock"><div className="panel-head"><div><h3>สินค้าใกล้หมด</h3><p>สินค้าที่ต่ำกว่าจุดสั่งซื้อ</p></div><button className="text-button">ดูทั้งหมด</button></div>{products.filter((p) => p.stock <= p.min + 2).map((p) => <div className="stock-row" key={p.id}><div className="product-emoji" style={{ background: p.color }}>{p.icon}</div><div className="stock-name"><strong>{p.name}</strong><span>{p.code}</span></div><div className="stock-count"><strong className={p.stock <= p.min ? "danger" : ""}>{p.stock} {p.unit}</strong><span>ขั้นต่ำ {p.min}</span></div></div>)}</section>
      <section className="panel transactions"><div className="panel-head"><div><h3>รายการขายล่าสุด</h3><p>อัปเดตแบบเรียลไทม์</p></div><button className="text-button">ดูทั้งหมด</button></div>
        {[['SL-690809-0128','ลูกค้าทั่วไป','฿245.00','14:22'],['SL-690809-0127','คุณณัฐวุฒิ','฿1,280.00','14:18'],['SL-690809-0126','ลูกค้าทั่วไป','฿89.00','14:12']].map((r) => <div className="transaction-row" key={r[0]}><div className="receipt-icon"><ReceiptText size={18}/></div><div><strong>{r[0]}</strong><span>{r[1]} · {r[3]} น.</span></div><b>{r[2]}</b><em>ชำระแล้ว</em></div>)}
      </section>
    </div>
  </>;
}

function Metric({ label, value, trend, trendDown, sub, icon: Icon, color, warning }: { label: string; value: string; trend?: string; trendDown?: boolean; sub?: string; icon: typeof Store; color: string; warning?: boolean }) {
  return <article className="metric-card"><div className={`metric-icon ${color}`}><Icon size={22} /></div><div className="metric-main"><span>{label}</span><strong>{value}</strong><p className={warning ? "warn" : trendDown ? "down" : ""}>{trend && <>{trendDown ? <ArrowDownRight size={13}/> : <ArrowUpRight size={13}/>} {trend}</>}{sub}</p></div><button><ChevronDown size={16} /></button></article>;
}

function Quick({ icon: Icon, label, color, onClick }: { icon: typeof Store; label: string; color: string; onClick?: () => void }) { return <button className="quick" onClick={onClick}><span className={color}><Icon size={22}/></span><strong>{label}</strong><ChevronDown size={15}/></button>; }

type ApiProduct = Omit<Product, "color" | "icon">;
type CategoryOption = { id: string; name: string; count: number };
type ProductResponse = { items: ApiProduct[]; total: number; totalPages: number; page: number; message?: string };

const productColors = ["#dceeff", "#ffe5e2", "#fff0c7", "#e7e6ff", "#e2f5ef", "#fff2dc"];

function presentProduct(item: ApiProduct): Product {
  const hash = Array.from(item.code).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return { ...item, id: item.code, color: productColors[hash % productColors.length], icon: "📦" };
}

function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function OptimizedPOS({ cart, add, qty, changeUnit, changeLot, total, customer, onCustomerChange, onPay, onOpenHeld, heldBillCount, refreshKey, completedSale, documentLoading, onPrintReceipt, onTaxInvoice, onStartNew }: { cart: CartLine[]; add: (p: Product, lot?: ProductLot|null) => void; qty: (id: string|number, d: number) => void; changeUnit:(cartKey:string,unitId:string)=>void; changeLot:(cartKey:string,lot:ProductLot)=>void; total: number; customer:CustomerChoice|null;onCustomerChange:(customer:CustomerChoice|null)=>void;onPay: () => void; onOpenHeld:()=>void; heldBillCount:number; refreshKey: number; completedSale:SaleResult|null;documentLoading:"receipt"|"tax-invoice"|null;onPrintReceipt:()=>void;onTaxInvoice:()=>void;onStartNew:()=>void }) {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customerPicker,setCustomerPicker]=useState(false);
  const [lotPicker,setLotPicker]=useState<{product:Product;lots:ProductLot[];cartKey?:string}|null>(null);
  const [lotLoading,setLotLoading]=useState(false);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    fetch("/api/categories")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setCategories(payload.items ?? []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: "1", limit: "48" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryId) params.set("categoryId", categoryId);
    setLoading(true);
    setError("");
    fetch(`/api/products?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: ProductResponse) => setItems((payload.items ?? []).map(presentProduct)))
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setItems(products);
        setError("เชื่อมต่อฐานข้อมูลไม่ได้ กำลังแสดงข้อมูลตัวอย่าง");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedSearch, categoryId, refreshKey]);

  async function openProduct(product: Product) {
    if(completedSale||lotLoading)return;
    if(product.trackExpiry===false){add(product);return;}
    setLotLoading(true);setBarcodeError("");
    try {
      const response=await fetch(`/api/products?code=${encodeURIComponent(product.code)}&lots=true`);
      const payload:ProductResponse=await response.json();
      if(!response.ok)throw new Error(payload.message??"โหลด Lot ไม่สำเร็จ");
      const enriched=payload.items[0]?presentProduct(payload.items[0]):product;
      const lots=enriched.lots??[];
      if(lots.length>1){setLotPicker({product:enriched,lots});return;}
      add(enriched,enriched.trackExpiry===true?lots[0]??null:null);
    } catch (reason) {
      setBarcodeError(reason instanceof Error?reason.message:"โหลด Lot ไม่สำเร็จ");
    } finally { setLotLoading(false); }
  }

  async function scanBarcode() {
    if(completedSale)return;
    const value = barcode.trim();
    if (!value) return;
    setBarcodeError("");
    try {
      const response = await fetch(`/api/products?barcode=${encodeURIComponent(value)}&lots=true`);
      if (!response.ok) throw new Error();
      const payload: ProductResponse = await response.json();
      if (payload.items[0]) {
        const product=presentProduct(payload.items[0]);
        const lots=product.lots??[];
        if(product.trackExpiry!==false&&lots.length>1){setLotPicker({product,lots});setBarcode("");return;}
        add(product,product.trackExpiry===true?lots[0]??null:null);
        setBarcode("");
        return;
      }
      setBarcodeError("ไม่พบสินค้าจากบาร์โค้ดนี้");
    } catch {
      setBarcodeError("อ่านบาร์โค้ดไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }

  return <><div className="pos-layout">
    <aside className="cart-panel sale-column">
      <div className="sale-context">
        <span className="sale-number">{completedSale ? <>ชำระแล้ว · <b>{completedSale.invoiceNo}</b></> : "บิลขายใหม่"}</span>
        <button disabled={Boolean(completedSale)} className={`customer-button ${customer?"selected":""}`} onClick={()=>setCustomerPicker(true)}><UserRound size={16}/><span>{customer?.name??"ลูกค้าทั่วไป"}{customer&&<small>ระดับราคา {customer.priceLevel}</small>}</span><ChevronDown size={14}/></button>
      </div>
      <form className="sale-barcode" onSubmit={event=>{event.preventDefault();void scanBarcode()}}>
        <label><ScanBarcode size={20}/><input disabled={Boolean(completedSale)} data-pos-search aria-label="ยิงบาร์โค้ดเพื่อเพิ่มสินค้า" autoComplete="off" placeholder={completedSale?"รายการนี้ชำระเงินแล้ว":"ยิงบาร์โค้ดเพื่อเพิ่มเข้ารายการ..."} value={barcode} onChange={event=>setBarcode(event.target.value)}/></label>
      </form>
      {barcodeError&&<div className="barcode-error">{barcodeError}</div>}
      <MultiUnitCart cart={cart} qty={qty} changeUnit={changeUnit} changeLot={(line)=>{if(line.lots&&line.lots.length>1)setLotPicker({product:line,lots:line.lots,cartKey:line.cartKey})}} total={total} onPay={onPay} onOpenHeld={onOpenHeld} heldBillCount={heldBillCount} completedSale={completedSale} documentLoading={documentLoading} onPrintReceipt={onPrintReceipt} onTaxInvoice={onTaxInvoice} onStartNew={onStartNew}/>
    </aside>
    <section className="catalog product-column">
      <div className="pos-heading product-heading"><h2>เลือกสินค้า</h2><span className="catalog-count">{items.length} รายการ</span></div>
      <div className="search-box pos-search"><Search size={19}/><input disabled={Boolean(completedSale)} aria-label="ค้นหาสินค้า" placeholder="ค้นหาชื่อ รหัส หรือรายละเอียดสินค้า..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>ค้นหา</kbd></div>
      <div className="category-tabs"><button disabled={Boolean(completedSale)||lotLoading} className={!categoryId ? "active" : ""} onClick={() => setCategoryId("")}>ทั้งหมด</button>{categories.map((category) => <button disabled={Boolean(completedSale)||lotLoading} key={category.id} className={categoryId === category.id ? "active" : ""} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div>
      {error && <div className="data-message warning-message">{error}</div>}
      {loading ? <div className="catalog-loading">กำลังโหลดสินค้า...</div> : items.length === 0 ? <div className="catalog-loading">ไม่พบสินค้า</div> : <div className={`catalog-list ${completedSale?"completed-catalog":""}`}>
        <div className="catalog-list-head"><span>สินค้า</span><span>ราคา / คงเหลือ</span></div>
        {items.map(product=>{const base=product.units?.find(unit=>unit.isBase&&unit.active&&unit.canSell);return <button disabled={Boolean(completedSale)||lotLoading} className="catalog-product-row" key={product.id} onClick={()=>void openProduct(product)}>
          <span className="catalog-product-name"><strong>{product.name}</strong><small>{product.code} · {base?.name??product.unit}</small></span>
          <span className="catalog-product-price"><b>฿{money(salePriceForCustomer(product,base,customer))}</b><small className={product.stock<=product.min?"catalog-low-stock":""}>เหลือ {product.stock.toLocaleString("th-TH")}</small></span>
          <span className="catalog-product-add"><Plus size={16}/></span>
        </button>})}
      </div>}
    </section>
  </div>{customerPicker&&<CustomerPicker selected={customer} onClose={()=>setCustomerPicker(false)} onSelect={value=>{onCustomerChange(value);setCustomerPicker(false)}}/>}{lotPicker&&<LotPicker product={lotPicker.product} lots={lotPicker.lots} onClose={()=>setLotPicker(null)} onSelect={(lot)=>{if(lotPicker.cartKey)changeLot(lotPicker.cartKey,lot);else add(lotPicker.product,lot);setLotPicker(null)}}/>}</>;
}

function LotPicker({product,lots,onClose,onSelect}:{product:Product;lots:ProductLot[];onClose:()=>void;onSelect:(lot:ProductLot)=>void}) {
  const expiry=(value:string)=>new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"}).format(new Date(value));
  return <div className="modal-backdrop"><section className="lot-picker-modal">
    <header><div><span>เลือก Lot ที่ลูกค้าหยิบจริง</span><h2>{product.name}</h2><small>{product.code}</small></div><button aria-label="ปิด" onClick={onClose}><X size={20}/></button></header>
    <div className="lot-picker-body"><div className="lot-picker-hint"><Check size={17}/><span>ระบบเรียง Lot ที่หมดอายุก่อนขึ้นก่อน พนักงานสามารถเลือก Lot อื่นได้</span></div><div className="lot-picker-list">{lots.map((lot,index)=><button key={lot.id} className={`lot-picker-option ${index===0?"recommended":""}`} onClick={()=>onSelect(lot)}><span className="lot-picker-radio">{index===0?<Check size={16}/>:<span/>}</span><span className="lot-picker-main"><strong>Lot {lot.lotNo}</strong><small>หมดอายุ {expiry(lot.expireDate)} · เหลือ {lot.daysRemaining<0?"หมดอายุแล้ว":lot.daysRemaining===0?"วันนี้":`${lot.daysRemaining} วัน`}</small>{lot.promotion&&<b className="lot-promo-label">โปรโมชั่น {lot.promotion.type==="percent"?`ลด ${lot.promotion.value}%`:`ราคา ฿${money(lot.promotion.value)}`}</b>}</span><span className="lot-picker-stock">{lot.quantity.toLocaleString("th-TH")} ชิ้น{index===0&&<em>แนะนำ FEFO</em>}</span></button>)}</div></div>
    <footer><button onClick={onClose}>ยกเลิก</button></footer>
  </section></div>
}

function CustomerPicker({selected,onClose,onSelect}:{selected:CustomerChoice|null;onClose:()=>void;onSelect:(customer:CustomerChoice|null)=>void}) {
  const [query,setQuery]=useState(""),[rows,setRows]=useState<CustomerChoice[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [adding,setAdding]=useState(false),[saving,setSaving]=useState(false);
  const [newCustomer,setNewCustomer]=useState({name:"",phone:"",priceLevel:"0",taxId:"",address1:""});

  useEffect(()=>{
    if(adding)return;
    const controller=new AbortController(),timer=window.setTimeout(()=>{
      setLoading(true);setError("");
      fetch(`/api/customer-management${query.trim()?`?search=${encodeURIComponent(query.trim())}`:""}`,{signal:controller.signal})
        .then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.message??"โหลดลูกค้าไม่สำเร็จ");setRows(payload.items??[])})
        .catch(reason=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;setError(reason instanceof Error?reason.message:"โหลดลูกค้าไม่สำเร็จ")})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    },250);
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[query,adding]);

  function beginAdd(){setAdding(true);setError("");setNewCustomer({name:"",phone:"",priceLevel:"0",taxId:"",address1:""})}

  async function saveCustomer(){
    if(saving||!newCustomer.name.trim()||!newCustomer.phone.replace(/[^0-9]/g,""))return;
    setSaving(true);setError("");
    try{
      const response=await fetch("/api/customer-management",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newCustomer,creditDays:0})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.message??"เพิ่มลูกค้าไม่สำเร็จ");
      const customer=payload.customer;
      onSelect({code:customer.code,name:customer.name,phone:customer.phone,priceLevel:customer.priceLevel});
    }catch(cause){setError(cause instanceof Error?cause.message:"เพิ่มลูกค้าไม่สำเร็จ")}
    finally{setSaving(false)}
  }

  return <div className="modal-backdrop"><div className="customer-picker-modal">
    <header><div><span>{adding?"เพิ่มข้อมูลลูกค้าสำหรับบิลนี้":"เลือกลูกค้าสำหรับบิลนี้"}</span><h2>{adding?"เพิ่มลูกค้า":"ค้นหาลูกค้า"}</h2></div><button aria-label="ปิด" onClick={onClose}><X size={19}/></button></header>
    {adding ? <div className="customer-picker-body customer-picker-add-body"><div className="form-grid">
      <label className="span-two"><span>ชื่อลูกค้า <em className="required-marker">*</em></span><input autoFocus maxLength={80} value={newCustomer.name} onChange={event=>setNewCustomer({...newCustomer,name:event.target.value})}/></label>
      <label><span>โทรศัพท์ <em className="required-marker">*</em></span><input type="tel" maxLength={40} value={newCustomer.phone} onChange={event=>setNewCustomer({...newCustomer,phone:event.target.value})}/></label>
      <label><span>ระดับราคา</span><select value={newCustomer.priceLevel} onChange={event=>setNewCustomer({...newCustomer,priceLevel:event.target.value})}><option value="0">0 — ราคาปกติ</option><option value="1">1 — ระดับ 1</option><option value="2">2 — ระดับ 2</option><option value="3">3 — ระดับ 3</option><option value="4">4 — ระดับ 4</option></select></label>
      <label><span>เลขผู้เสียภาษี</span><input maxLength={25} value={newCustomer.taxId} onChange={event=>setNewCustomer({...newCustomer,taxId:event.target.value})}/></label>
      <label className="span-two"><span>ที่อยู่</span><input maxLength={70} value={newCustomer.address1} onChange={event=>setNewCustomer({...newCustomer,address1:event.target.value})}/></label>
    </div>{error&&<div className="payment-error">{error}</div>}</div> : <div className="customer-picker-body">
      <label><Search size={19}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="ค้นหาชื่อ รหัส หรือเบอร์โทร..."/></label>
      <button className={`walk-in-customer ${!selected?"active":""}`} onClick={()=>onSelect(null)}><UserRound size={19}/><span><strong>ลูกค้าทั่วไป</strong><small>ใช้ราคาขายปกติ ไม่ผูกข้อมูลลูกค้า</small></span>{!selected&&<Check size={18}/>}</button>
      {error&&<div className="payment-error">{error}</div>}
      <div className="customer-picker-list">{loading?<div className="customer-picker-empty">กำลังค้นหาลูกค้า...</div>:rows.length===0?<div className="customer-picker-empty">ไม่พบลูกค้า</div>:rows.map(customer=><button key={customer.code} className={selected?.code===customer.code?"active":""} onClick={()=>onSelect(customer)}><span className="customer-picker-avatar">{customer.name.slice(0,2)}</span><span><strong>{customer.name}</strong><small>{customer.code} · {customer.phone??"ไม่มีเบอร์"}</small></span><em>ระดับ {customer.priceLevel}</em>{selected?.code===customer.code&&<Check size={17}/>}</button>)}</div>
    </div>}
    <footer>{adding ? <><button onClick={()=>{setAdding(false);setError("")}} disabled={saving}>ย้อนกลับ</button><button className="customer-picker-save" onClick={()=>void saveCustomer()} disabled={saving||!newCustomer.name.trim()||!newCustomer.phone.replace(/[^0-9]/g,"")}><Check size={16}/>{saving?"กำลังบันทึก...":"บันทึกและเลือก"}</button></> : <><button className="customer-picker-add" onClick={beginAdd}><Plus size={16}/>เพิ่มลูกค้า</button><button onClick={onClose}>ยกเลิก</button></>}</footer>
  </div></div>
}

function SaleQuantityInput({name,quantity,disabled,max,onCommit}:{name:string;quantity:number;disabled:boolean;max:number;onCommit:(value:number)=>void}){
  const [draft,setDraft]=useState(String(quantity)),[error,setError]=useState("");
  function commit(){
    const value=Number(draft);
    if(!draft.trim()||!Number.isInteger(value)||value<0||value>max){setDraft(String(quantity));setError(`กรอกจำนวน 0–${max.toLocaleString("th-TH")}`);return;}
    setError("");if(value!==quantity)onCommit(value);
  }
  return <span className="sale-quantity-editor"><input type="text" inputMode="numeric" autoComplete="off" aria-label={`จำนวน ${name}`} aria-invalid={Boolean(error)} title={error||"กรอกจำนวนแล้วกด Enter · กรอก 0 เพื่อลบรายการ"} disabled={disabled} value={draft} onFocus={event=>event.target.select()} onChange={event=>{setDraft(event.target.value);setError("")}} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur()}if(event.key==="Escape"){event.preventDefault();event.currentTarget.value=String(quantity);setDraft(String(quantity));setError("")}}}/>{error&&<small role="alert">{error}</small>}</span>;
}

function MultiUnitCart({cart,qty,changeUnit,changeLot,total,onPay,onOpenHeld,heldBillCount,completedSale,documentLoading,onPrintReceipt,onTaxInvoice,onStartNew}:{cart:CartLine[];qty:(key:string|number,delta:number)=>void;changeUnit:(key:string,unitId:string)=>void;changeLot:(line:CartLine)=>void;total:number;onPay:()=>void;onOpenHeld:()=>void;heldBillCount:number;completedSale:SaleResult|null;documentLoading:"receipt"|"tax-invoice"|null;onPrintReceipt:()=>void;onTaxInvoice:()=>void;onStartNew:()=>void}){
  const [clearConfirm,setClearConfirm]=useState(false);
  const totalBase=cart.reduce((sum,line)=>sum+line.qty*line.conversionRate,0);
  const lotDate=(value:string)=>new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"}).format(new Date(value));
  return <div className="multi-unit-cart">
    <div className="cart-head held-cart-head"><div><ShoppingBag size={20}/><h3>รายการขาย</h3><span>{cart.length.toLocaleString("th-TH")} รายการ</span></div>{completedSale?<span className="paid-cart-badge"><Check size={15}/> ชำระแล้ว</span>:<div className="cart-head-actions"><button className="held-list-button" onClick={onOpenHeld}><ListRestart size={16}/> บิลพัก{heldBillCount>0&&<b>{heldBillCount}</b>}</button>{cart.length>0&&<button className="clear-cart-button" onClick={()=>setClearConfirm(true)}><Trash2 size={16}/> ล้าง</button>}</div>}</div>
    <div className="sale-table-wrap">{cart.length===0?<div className="empty-cart"><div><ShoppingCart size={35}/></div><h3>ยังไม่มีสินค้า</h3><p>ยิงบาร์โค้ดด้านบน หรือเลือกสินค้าจากฝั่งขวา</p>{heldBillCount>0&&<button className="restore-empty-button" onClick={onOpenHeld}><Play size={15}/> เรียกคืนบิลที่พักไว้</button>}</div>:<table className="sale-table">
      <colgroup><col className="sale-name-col"/><col className="sale-unit-col"/><col className="sale-price-col"/><col className="sale-qty-col"/><col className="sale-total-col"/></colgroup>
      <thead><tr><th>สินค้า</th><th>หน่วย</th><th>ราคา</th><th>จำนวน</th><th>รวม</th></tr></thead>
      <tbody>{cart.map(line=>{const alternatives=line.units?.filter(unit=>unit.active&&unit.canSell)??[];const selectedLot=line.selectedLot;const maxLineQty=9999;return <tr key={line.cartKey}>
        <td><div className="sale-product-cell"><span><strong title={line.name}>{line.name}</strong><small>{line.code}{selectedLot&&<> · Lot {selectedLot.lotNo} · {lotDate(selectedLot.expireDate)}</>}</small>{selectedLot&&line.lots&&line.lots.length>1&&<button className="change-lot-button" disabled={Boolean(completedSale)} onClick={()=>changeLot(line)}>เปลี่ยน Lot</button>}</span></div></td>
        <td><div className="cart-unit-picker"><select disabled={Boolean(completedSale)||!alternatives.length} aria-label={`หน่วยขาย ${line.name}`} value={line.unitId??""} onChange={event=>changeUnit(line.cartKey,event.target.value)}>{alternatives.length?alternatives.map(unit=><option value={unit.id} key={unit.id}>{unit.name}</option>):<option value="">{line.unitName}</option>}</select></div></td>
        <td className="sale-price-cell">฿{money(line.price)}{selectedLot?.promotion&&<small className="sale-promo-label">โปร</small>}</td>
        <td><div className="qty-control table-qty"><button disabled={Boolean(completedSale)} aria-label={`ลดจำนวน ${line.name}`} onClick={()=>qty(line.cartKey,-1)}><Minus size={13}/></button><SaleQuantityInput key={line.qty} name={line.name} quantity={line.qty} disabled={Boolean(completedSale)} max={maxLineQty} onCommit={value=>qty(line.cartKey,value-line.qty)}/><button disabled={Boolean(completedSale)||line.qty>=maxLineQty} aria-label={`เพิ่มจำนวน ${line.name}`} onClick={()=>qty(line.cartKey,1)}><Plus size={13}/></button></div></td>
        <td><strong className="line-total">฿{money(line.price*line.qty)}</strong></td>
      </tr>})}</tbody>
    </table>}</div>
    <div className={`cart-summary ${completedSale?"completed-summary":""}`}><div><span>ยอดรวม</span><b>฿{money(total)}</b></div><div><span>จำนวนตัดสต็อก</span><b>{totalBase.toLocaleString("th-TH")} หน่วยย่อย</b></div><div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>฿{money(total*7/107)}</span></div><div className="grand-total"><span>ยอดชำระ</span><strong>฿{money(total)}</strong></div>{completedSale?<div className="completed-sale-panel"><div className="completed-sale-status"><span><Check size={19}/></span><div><strong>ชำระเงินเรียบร้อย</strong><small>เลขที่บิล {completedSale.invoiceNo}</small></div></div><div className="completed-sale-actions"><button className="print-completed-button" disabled={documentLoading!==null} onClick={onPrintReceipt}><Printer size={18}/>{documentLoading==="receipt"?"กำลังพิมพ์...":"พิมพ์ใบเสร็จ"}</button><button className="tax-invoice-button" disabled={documentLoading!==null} onClick={onTaxInvoice}><ReceiptText size={18}/>{documentLoading==="tax-invoice"?"กำลังเตรียม...":"ออกใบกำกับภาษี"}</button><button className="start-new-sale-button" aria-keyshortcuts="F8" disabled={documentLoading!==null} onClick={onStartNew}><ShoppingCart size={18}/>เริ่มขาย <kbd>F8</kbd></button></div></div>:<div className="sale-action-buttons"><button className="hold-button" disabled={!cart.length} onClick={onOpenHeld}><Pause size={19}/><span>พักบิล</span></button><button className="pay-button" disabled={!cart.length} onClick={onPay}><WalletCards size={21}/><span>ชำระเงิน</span><kbd>F8</kbd></button></div>}</div>
    {clearConfirm&&<div className="modal-backdrop clear-cart-backdrop" onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();setClearConfirm(false)}}}><section className="clear-cart-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-cart-title" aria-describedby="clear-cart-description"><div className="clear-cart-icon"><Trash2 size={24}/></div><h2 id="clear-cart-title">ล้างรายการขายทั้งหมด?</h2><p id="clear-cart-description">สินค้าทั้ง {cart.length} รายการ ยอด ฿{money(total)} จะถูกนำออกจากบิลนี้</p><div className="clear-cart-actions"><button autoFocus onClick={()=>setClearConfirm(false)}>กลับไปขายต่อ</button><button className="confirm-clear-cart" onClick={()=>{if(!completedSale)cart.forEach(line=>qty(line.cartKey,-line.qty));setClearConfirm(false)}}><Trash2 size={16}/>ยืนยันล้างรายการ</button></div></section></div>}
  </div>
}

type StockHistoryItem = { id: string; quantity: number; unitCost: number; balance: number; actor: string | null; occurredAt: string | null; status: string | null; note: string | null };

function FullProducts() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [editorProduct, setEditorProduct] = useState<Product | null | undefined>(undefined);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    fetch("/api/categories").then((response) => response.ok ? response.json() : Promise.reject()).then((payload) => setCategories(payload.items ?? [])).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "50", status });
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (categoryId) params.set("categoryId", categoryId);
    setLoading(true); setError("");
    fetch(`/api/products?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: ProductResponse) => { setRows((payload.items ?? []).map(presentProduct)); setTotal(payload.total ?? 0); setTotalPages(Math.max(payload.totalPages ?? 1, 1)); })
      .catch((reason) => { if (reason instanceof DOMException && reason.name === "AbortError") return; setRows([]); setError("โหลดข้อมูลสินค้าไม่สำเร็จ"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery, status, categoryId, page, revision]);

  function changed(message: string) { setNotice(message); setRevision((current) => current + 1); }

  async function toggleActive(product: Product) {
    const active = Boolean(product.inactive);
    const verb = active ? "เปิดขาย" : "ปิดขาย";
    if (!window.confirm(`ยืนยัน${verb}สินค้า “${product.name}” หรือไม่`)) return;
    try {
      const response = await fetch("/api/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setActive", code: product.code, active }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? `${verb}ไม่สำเร็จ`);
      changed(`${verb}สินค้า ${product.code} เรียบร้อยแล้ว`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : `${verb}ไม่สำเร็จ`); }
  }

  return <><PageTitle title="สินค้าและสต็อก" desc="เพิ่ม แก้ไข ตั้งราคา ปรับสต็อก และพิมพ์บาร์โค้ด" action="เพิ่มสินค้าใหม่" icon={Plus} onAction={() => setEditorProduct(null)}/>
    <div className="product-filters"><div className="search-box"><Search size={18}/><input placeholder="ค้นหารหัส ชื่อ หรือชื่อสำรอง" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/></div><select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">ทุกประเภท</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.count})</option>)}</select><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">กำลังขาย</option><option value="inactive">ปิดขาย</option><option value="all">ทุกสถานะ</option></select></div>
    {notice && <div className="data-message success-message">{notice}</div>}{error && <div className="data-message warning-message">{error}</div>}
    <section className="panel table-panel product-management-table"><table><thead><tr><th>สินค้า</th><th>ประเภท</th><th>ราคาทุน</th><th>ราคาขาย</th><th>คงเหลือ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{loading ? <tr><td colSpan={7}><div className="table-loading">กำลังโหลดสินค้า...</div></td></tr> : rows.length === 0 ? <tr><td colSpan={7}><div className="table-loading">ไม่พบสินค้า</div></td></tr> : rows.map((product) => <tr key={product.code} className={product.inactive ? "inactive-product" : ""}><td><div className="table-product"><span style={{background: product.color}}>{product.icon}</span><div><strong>{product.name}</strong><small>{product.code} · {product.unit}</small></div></div></td><td>{product.category}</td><td>฿{money(product.cost)}</td><td><strong>฿{money(product.price)}</strong></td><td><strong className={product.stock <= product.min ? "stock-danger" : ""}>{product.stock.toLocaleString("th-TH")}</strong> {product.unit}</td><td><span className={`status ${product.inactive ? "low" : "ok"}`}>{product.inactive ? "ปิดขาย" : "กำลังขาย"}</span></td><td><div className="row-actions"><button title="แก้ไข" onClick={() => setEditorProduct(product)}>แก้ไข</button><button title="ปรับสต็อก" onClick={() => setStockProduct(product)}>สต็อก</button><button title="ประวัติ" onClick={() => setHistoryProduct(product)}>ประวัติ</button><button title="บาร์โค้ด" onClick={() => setBarcodeProduct(product)}>บาร์โค้ด</button><button className={product.inactive ? "activate" : "deactivate"} onClick={() => void toggleActive(product)}>{product.inactive ? "เปิดขาย" : "ปิดขาย"}</button></div></td></tr>)}</tbody></table><div className="pagination"><span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ · หน้า {page} / {totalPages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>ก่อนหน้า</button><button disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>ถัดไป</button></div></div></section>
    {editorProduct !== undefined && <ProductEditor product={editorProduct} categories={categories} onClose={() => setEditorProduct(undefined)} onSaved={(product, created) => { setEditorProduct(undefined); changed(`${created ? "เพิ่ม" : "แก้ไข"}สินค้า ${product.code} เรียบร้อยแล้ว`); }}/>} 
    {stockProduct && <StockAdjustment product={stockProduct} onClose={() => setStockProduct(null)} onSaved={(product) => { setStockProduct(null); changed(`ปรับสต็อก ${product.code} คงเหลือ ${product.stock.toLocaleString("th-TH")} ${product.unit}`); }}/>} 
    {historyProduct && <StockHistory product={historyProduct} onClose={() => setHistoryProduct(null)}/>} 
    {barcodeProduct && <BarcodeLabel product={barcodeProduct} onClose={() => setBarcodeProduct(null)}/>} 
  </>;
}

function ProductEditor({ product, categories, onClose, onSaved }: { product: Product | null; categories: CategoryOption[]; onClose: () => void; onSaved: (product: Product, created: boolean) => void }) {
  const created = product === null;
  const [form, setForm] = useState({ code: product?.code ?? "", barcode: product?.units?.find((unit) => unit.isBase)?.barcode ?? "", name: product?.name ?? "", alternateName: product?.alternateName ?? "", categoryId: product?.categoryId ?? "", unit: product?.unit ?? "ชิ้น", cost: product?.cost ?? 0, price: product?.price ?? 0, price1: product?.price1 ?? 0, price2: product?.price2 ?? 0, price3: product?.price3 ?? 0, price4: product?.price4 ?? 0, quantity: product?.stock ?? 0, minStock: product?.min ?? 0, maxStock: product?.max ?? 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/products", { method: created ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(created ? form : { ...form, action: "update", quantity: undefined }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "บันทึกสินค้าไม่สำเร็จ");
      onSaved(presentProduct(payload.product), created);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "บันทึกสินค้าไม่สำเร็จ"); setSaving(false); }
  }

  const numberField = (label: string, key: keyof typeof form) => <label><span>{label}</span><input type="number" min="0" step="0.01" value={String(form[key])} onChange={(event) => update(key, Number(event.target.value))}/></label>;
  return <div className="modal-backdrop"><div className="management-modal"><div className="management-head"><div><span>{created ? "สินค้าใหม่" : product.code}</span><h2>{created ? "เพิ่มสินค้า" : "แก้ไขสินค้า"}</h2></div><button onClick={onClose}><X size={19}/></button></div><div className="management-body"><div className="form-grid"><label><span>รหัสสินค้า (SKU) *</span><input maxLength={25} disabled placeholder="สร้างอัตโนมัติเมื่อบันทึก" value={form.code} onChange={(event) => update("code", event.target.value)}/></label><label><span>Barcode หน่วยหลัก *</span><input maxLength={50} placeholder="สแกนหรือกรอกรหัสแท่ง" value={form.barcode} onChange={(event) => update("barcode", event.target.value)}/></label><label><span>ชื่อสินค้า *</span><input maxLength={80} value={form.name} onChange={(event) => update("name", event.target.value)}/></label><label><span>ชื่อสำรอง</span><input maxLength={100} value={form.alternateName} onChange={(event) => update("alternateName", event.target.value)}/></label><label><span>ประเภทสินค้า</span><select value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">ไม่ระบุ</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label><span>หน่วย</span><input maxLength={12} value={form.unit} onChange={(event) => update("unit", event.target.value)}/></label>{numberField("ราคาทุน", "cost")}{numberField("ราคาขายปกติ", "price")}{numberField("ราคาขายระดับ 1", "price1")}{numberField("ราคาขายระดับ 2", "price2")}{numberField("ราคาขายระดับ 3", "price3")}{numberField("ราคาขายระดับ 4", "price4")}{created && numberField("ยอดสต็อกเริ่มต้น", "quantity")}{numberField("จุดสั่งซื้อขั้นต่ำ", "minStock")}{numberField("สต็อกสูงสุด", "maxStock")}</div>{error && <div className="payment-error">{error}</div>}</div><div className="management-footer"><button className="cancel" disabled={saving} onClick={onClose}>ยกเลิก</button><button className="confirm" disabled={saving || !form.barcode.trim() || !form.name.trim()} onClick={() => void save()}>{saving ? "กำลังบันทึก..." : "บันทึกสินค้า"}</button></div></div></div>;
}

function StockAdjustment({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (product: Product) => void }) {
  const [mode, setMode] = useState<"add" | "remove">("add"); const [quantity, setQuantity] = useState(1); const [reason, setReason] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function save() { setSaving(true); setError(""); try { const adjustment = Math.abs(quantity) * (mode === "add" ? 1 : -1); const response = await fetch("/api/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "adjustStock", code: product.code, adjustment, reason }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "ปรับสต็อกไม่สำเร็จ"); onSaved(presentProduct(payload.product)); } catch (cause) { setError(cause instanceof Error ? cause.message : "ปรับสต็อกไม่สำเร็จ"); setSaving(false); } }
  const projected = product.stock + Math.abs(quantity || 0) * (mode === "add" ? 1 : -1);
  return <div className="modal-backdrop"><div className="small-management-modal"><div className="management-head"><div><span>{product.code}</span><h2>ปรับสต็อก</h2></div><button onClick={onClose}><X size={19}/></button></div><div className="management-body"><strong className="adjust-product-name">{product.name}</strong><div className="stock-before"><span>คงเหลือปัจจุบัน</span><b>{product.stock.toLocaleString("th-TH")} {product.unit}</b></div><div className="adjust-mode"><button className={mode === "add" ? "active" : ""} onClick={() => setMode("add")}>เพิ่มสต็อก</button><button className={mode === "remove" ? "active remove" : ""} onClick={() => setMode("remove")}>ลดสต็อก</button></div><label className="management-field"><span>จำนวน</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}/></label><label className="management-field"><span>เหตุผล *</span><textarea maxLength={200} placeholder="เช่น ตรวจนับสต็อก, ของเสีย, ของแถม" value={reason} onChange={(event) => setReason(event.target.value)}/></label><div className={`projected-stock ${projected < 0 ? "invalid" : ""}`}><span>คงเหลือหลังปรับ</span><strong>{projected.toLocaleString("th-TH")} {product.unit}</strong></div>{error && <div className="payment-error">{error}</div>}</div><div className="management-footer"><button className="cancel" onClick={onClose}>ยกเลิก</button><button className="confirm" disabled={saving || quantity <= 0 || reason.trim().length < 3 || projected < 0} onClick={() => void save()}>{saving ? "กำลังบันทึก..." : "ยืนยันปรับสต็อก"}</button></div></div></div>;
}

function StockHistory({ product, onClose }: { product: Product; onClose: () => void }) {
  const [items, setItems] = useState<StockHistoryItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch(`/api/products?history=${encodeURIComponent(product.code)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject()).then((payload) => setItems(payload.items ?? [])).catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("โหลดประวัติไม่สำเร็จ"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [product.code]);
  const labels: Record<string, string> = { S: "ขาย", R: "คืนสินค้า", A: "ปรับสต็อก" };
  return <div className="modal-backdrop"><div className="history-modal"><div className="management-head"><div><span>{product.code}</span><h2>ประวัติสต็อก · {product.name}</h2></div><button onClick={onClose}><X size={19}/></button></div><div className="history-list">{loading ? <div className="table-loading">กำลังโหลดประวัติ...</div> : error ? <div className="table-loading">{error}</div> : items.length === 0 ? <div className="table-loading">ยังไม่มีประวัติสต็อก</div> : items.map((item) => <div className="history-row" key={item.id}><div className={item.quantity >= 0 ? "history-icon in" : "history-icon out"}>{item.quantity >= 0 ? <Plus size={16}/> : <Minus size={16}/>}</div><div><strong>{labels[item.status ?? ""] ?? "ความเคลื่อนไหวสต็อก"}</strong><span>{item.note ?? "-"} · {item.actor ?? "-"}</span><small>{saleDate(item.occurredAt)}</small></div><div><b className={item.quantity >= 0 ? "positive" : "negative"}>{item.quantity >= 0 ? "+" : ""}{item.quantity.toLocaleString("th-TH")}</b><span>คงเหลือ {item.balance.toLocaleString("th-TH")}</span></div></div>)}</div></div></div>;
}

const eanL = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const eanG = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const eanR = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const eanParity = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
function ean13Bits(code: string) { if (!/^\d{13}$/.test(code)) return null; const digits = [...code].map(Number); const parity = eanParity[digits[0]]; return `101${digits.slice(1,7).map((digit,index) => parity[index] === "L" ? eanL[digit] : eanG[digit]).join("")}01010${digits.slice(7).map((digit) => eanR[digit]).join("")}101`; }

function BarcodeLabel({ product, onClose }: { product: Product; onClose: () => void }) {
  const barcode = product.units?.find((unit) => unit.isBase)?.barcode ?? product.code;
  const bits = ean13Bits(barcode);
  return <div className="modal-backdrop"><div className="barcode-dialog"><div className="receipt-actions"><button className="cancel" onClick={onClose}><X size={17}/>ปิด</button><button className="primary" onClick={() => window.print()}><Printer size={17}/>พิมพ์ฉลาก</button></div><article className="barcode-print"><strong>{product.name}</strong>{bits ? <svg viewBox="0 0 105 62" role="img" aria-label={`บาร์โค้ด ${barcode}`}><rect width="105" height="62" fill="white"/>{[...bits].map((bit, index) => bit === "1" ? <rect key={index} x={index + 5} y="3" width="1" height="48" fill="black"/> : null)}</svg> : <div className="barcode-unavailable">รหัสนี้ไม่ใช่ EAN-13<br/>พิมพ์เป็นข้อความแทน</div>}<span>{barcode}</span><b>฿{money(product.price)}</b></article></div></div>;
}

function OptimizedProducts() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (debouncedQuery) params.set("search", debouncedQuery);
    setLoading(true);
    setError("");
    fetch(`/api/products?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: ProductResponse) => {
        setRows((payload.items ?? []).map(presentProduct));
        setTotal(payload.total ?? 0);
        setTotalPages(Math.max(payload.totalPages ?? 1, 1));
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setRows([]);
        setError("โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, page]);

  return <><PageTitle title="สินค้าและสต็อก" desc="จัดการสินค้า ราคา และจำนวนคงเหลือ" action="เพิ่มสินค้าใหม่" icon={Plus}/><div className="toolbar"><div className="search-box"><Search size={18}/><input placeholder="ค้นหารหัสหรือชื่อสินค้า" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/></div><button className="filter-button"><Tag size={17}/>ทุกประเภท<ChevronDown size={15}/></button><button className="filter-button"><Boxes size={17}/>ทุกสถานะ<ChevronDown size={15}/></button><button className="outline-button"><ScanBarcode size={17}/>พิมพ์บาร์โค้ด</button></div>
    {error && <div className="data-message warning-message">{error}</div>}
    <section className="panel table-panel"><table><thead><tr><th>สินค้า</th><th>ประเภท</th><th>หน่วย</th><th>ราคาทุน</th><th>ราคาขาย</th><th>คงเหลือ</th><th>สถานะ</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan={8}><div className="table-loading">กำลังโหลดสินค้า...</div></td></tr> : rows.length === 0 ? <tr><td colSpan={8}><div className="table-loading">ไม่พบสินค้า</div></td></tr> : rows.map((product) => <tr key={product.id}><td><div className="table-product"><span style={{background: product.color}}>{product.icon}</span><div><strong>{product.name}</strong><small>{product.code}</small></div></div></td><td>{product.category}</td><td>{product.unit}</td><td>฿{money(product.cost)}</td><td><strong>฿{money(product.price)}</strong></td><td><strong>{product.stock}</strong> {product.unit}</td><td><span className={`status ${product.stock <= product.min ? "low" : "ok"}`}>{product.stock <= product.min ? "ใกล้หมด" : "พร้อมขาย"}</span></td><td><button className="more">•••</button></td></tr>)}</tbody></table>
      <div className="pagination"><span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ · หน้า {page} / {totalPages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>ก่อนหน้า</button><button disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>ถัดไป</button></div></div>
    </section></>;
}

function POS({ cart, filtered, categories, category, setCategory, search, setSearch, add, qty, total, onPay }: { cart: CartLine[]; filtered: Product[]; categories: string[]; category: string; setCategory: (v:string)=>void; search:string; setSearch:(v:string)=>void; add:(p:Product)=>void; qty:(id:Product["id"],d:number)=>void; total:number; onPay:()=>void }) {
  return <div className="pos-layout">
    <section className="catalog">
      <div className="pos-heading"><div><span className="sale-number">เลขที่การขาย <b>SL-690809-0129</b></span><h2>เลือกสินค้า</h2></div><button className="customer-button"><UserRound size={17}/> ลูกค้าทั่วไป <ChevronDown size={15}/></button></div>
      <div className="search-box pos-search"><Search size={19}/><input aria-label="ค้นหาสินค้า" placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า..." value={search} onChange={(e)=>setSearch(e.target.value)} /><kbd>F2</kbd></div>
      <div className="category-tabs">{categories.map((c)=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <div className="product-grid">{filtered.map((p)=><button className="product-card" key={p.id} onClick={()=>add(p)}><div className="product-picture" style={{background:p.color}}><span>{p.icon}</span>{p.stock<=p.min&&<i>ใกล้หมด</i>}</div><div className="product-info"><small>{p.code}</small><strong>{p.name}</strong><div><b>฿{money(p.price)}</b><span>เหลือ {p.stock}</span></div></div><span className="add-product"><Plus size={16}/></span></button>)}</div>
    </section>
    <aside className="cart-panel">
      <div className="cart-head"><div><ShoppingBag size={20}/><h3>รายการขาย</h3><span>{cart.reduce((n,p)=>n+p.qty,0)} ชิ้น</span></div>{cart.length>0&&<button onClick={()=>cart.forEach(p=>qty(p.id,-p.qty))}><Trash2 size={16}/> ล้าง</button>}</div>
      <div className="cart-lines">{cart.length===0?<div className="empty-cart"><div><ShoppingCart size={35}/></div><h3>ยังไม่มีสินค้า</h3><p>สแกนบาร์โค้ด หรือเลือกสินค้าจากรายการ</p></div>:cart.map((p)=><div className="cart-line" key={p.id}><div className="mini-emoji" style={{background:p.color}}>{p.icon}</div><div className="line-info"><strong>{p.name}</strong><span>฿{money(p.price)} / {p.unit}</span><div className="qty-control"><button onClick={()=>qty(p.id,-1)}><Minus size={14}/></button><b>{p.qty}</b><button onClick={()=>qty(p.id,1)}><Plus size={14}/></button></div></div><strong className="line-total">฿{money(p.price*p.qty)}</strong></div>)}</div>
      <div className="cart-summary"><div><span>ยอดรวม</span><b>฿{money(total)}</b></div><div><span>ส่วนลด</span><button>+ เพิ่มส่วนลด</button></div><div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>฿{money(total*7/107)}</span></div><div className="grand-total"><span>ยอดชำระ</span><strong>฿{money(total)}</strong></div><button className="pay-button" disabled={!cart.length} onClick={onPay}><WalletCards size={21}/><span>ชำระเงิน</span><kbd>F5</kbd></button><p><Printer size={14}/> ใบเสร็จจะพิมพ์อัตโนมัติหลังชำระเงิน</p></div>
    </aside>
  </div>;
}

function Products({ products }: { products: Product[] }) {
  const [q,setQ]=useState("");
  const rows=useMemo(()=>products.filter(p=>`${p.name}${p.code}`.includes(q)),[q]);
  return <><PageTitle title="สินค้าและสต็อก" desc="จัดการสินค้า ราคา และจำนวนคงเหลือ" action="เพิ่มสินค้าใหม่" icon={Plus}/><div className="toolbar"><div className="search-box"><Search size={18}/><input placeholder="ค้นหารหัสหรือชื่อสินค้า" value={q} onChange={e=>setQ(e.target.value)}/></div><button className="filter-button"><Tag size={17}/>ทุกประเภท<ChevronDown size={15}/></button><button className="filter-button"><Boxes size={17}/>ทุกสถานะ<ChevronDown size={15}/></button><button className="outline-button"><ScanBarcode size={17}/>พิมพ์บาร์โค้ด</button></div><section className="panel table-panel"><table><thead><tr><th>สินค้า</th><th>ประเภท</th><th>หน่วย</th><th>ราคาทุน</th><th>ราคาขาย</th><th>คงเหลือ</th><th>สถานะ</th><th></th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><div className="table-product"><span style={{background:p.color}}>{p.icon}</span><div><strong>{p.name}</strong><small>{p.code}</small></div></div></td><td>{p.category}</td><td>{p.unit}</td><td>฿{money(p.cost)}</td><td><strong>฿{money(p.price)}</strong></td><td><strong>{p.stock}</strong> {p.unit}</td><td><span className={`status ${p.stock<=p.min?'low':'ok'}`}>{p.stock<=p.min?'ใกล้หมด':'พร้อมขาย'}</span></td><td><button className="more">•••</button></td></tr>)}</tbody></table></section></>;
}

type SaleListItem = {
  id: string; invoiceNo: string; customer: string; paymentType: string | null; total: number;
  vatAmount: number; soldBy: string; soldAt: string | null; cancelled: boolean; itemCount: number;
  cancelReason: string | null; cancelledAt: string | null; cancelledBy: string | null;
};
type SaleDetail = {
  id: string; invoiceNo: string | null; paymentType: string | null; subtotal: number; discountAmount: number;
  vatAmount: number; total: number; soldBy: string | null; soldAt: string | null; cancelled: boolean;
  cancelReason: string | null; cancelledAt: string | null; cancelledBy: string | null;
  customer: { code: string; name: string; address1: string | null; address2: string | null; taxId: string | null } | null;
  items: Array<{ id: string; code: string; name: string; quantity: number; returnedQuantity: number; unit: string; unitPrice: number; unitDiscount: number; lineTotal: number; lots?: Array<{ id: string; lotNo: string; expireDate: string; quantity: number }> }>;
  payments: Array<{ method:string;amount:number;receivedAmount:number|null;changeAmount:number|null;reference:string|null }>;
};
type ReceiptShop = { name: string; address1: string | null; address2: string | null; phone: string | null; taxId: string | null } | null;

const paymentLabels: Record<string, string> = { C: "เงินสด", T: "QR / โอน", D: "บัตร/โครงการรัฐ", M: "หลายช่องทาง" };
const paymentMethodLabels:Record<string,string>={cash:"เงินสด",transfer:"QR / โอน",card:"บัตร/โครงการรัฐ",unknown:"ไม่ระบุ"};
const saleDate = (value: string | null) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "-";

function SalesHistory() {
  const [query, setQuery] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SaleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [shop, setShop] = useState<ReceiptShop>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (paymentType) params.set("paymentType", paymentType);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    setLoading(true);
    setError("");
    fetch(`/api/sales?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        setRows(payload.items ?? []);
        setTotal(payload.total ?? 0);
        setTotalPages(Math.max(payload.totalPages ?? 1, 1));
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setRows([]);
        setError("โหลดประวัติการขายไม่สำเร็จ กรุณาลองใหม่");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery, paymentType, dateFrom, dateTo, page, revision]);

  async function openSale(id: string) {
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sales?id=${encodeURIComponent(id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "โหลดรายละเอียดบิลไม่สำเร็จ");
      setDetail(payload.sale);
      setShop(payload.shop);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดรายละเอียดบิลไม่สำเร็จ");
    } finally {
      setDetailLoading(false);
    }
  }

  function resetPage() { setPage(1); }

  return <><PageTitle title="ประวัติการขาย" desc="ค้นหา ตรวจสอบ และพิมพ์ใบเสร็จย้อนหลังจากข้อมูลจริง"/><div className="sales-filters"><div className="search-box"><Search size={18}/><input placeholder="ค้นหาเลขที่บิลหรือลูกค้า" value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }}/></div><label><span>จากวันที่</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); resetPage(); }}/></label><label><span>ถึงวันที่</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); resetPage(); }}/></label><select aria-label="วิธีชำระเงิน" value={paymentType} onChange={(event) => { setPaymentType(event.target.value); resetPage(); }}><option value="">ทุกวิธีชำระ</option><option value="C">มีเงินสด</option><option value="T">มี QR / โอน</option><option value="D">มีบัตร/โครงการรัฐ</option><option value="M">หลายช่องทาง</option></select></div>
    {notice && <div className="data-message success-message">{notice}</div>}{error && <div className="data-message warning-message">{error}</div>}
    <section className="panel table-panel"><table><thead><tr><th>เลขที่บิล</th><th>วันและเวลา</th><th>ลูกค้า</th><th>รายการ</th><th>วิธีชำระ</th><th>พนักงาน</th><th>ยอดสุทธิ</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan={8}><div className="table-loading">กำลังโหลดประวัติการขาย...</div></td></tr> : rows.length === 0 ? <tr><td colSpan={8}><div className="table-loading">ไม่พบรายการขาย</div></td></tr> : rows.map((sale) => <tr key={sale.id} className={sale.cancelled ? "cancelled-row" : ""}><td><button className="sale-link" onClick={() => void openSale(sale.id)}>{sale.invoiceNo}</button>{sale.cancelled && <small className="cancelled-label">ยกเลิกแล้ว</small>}</td><td>{saleDate(sale.soldAt)}</td><td>{sale.customer}</td><td>{sale.itemCount.toLocaleString("th-TH")} รายการ</td><td><span className="payment-badge">{paymentLabels[sale.paymentType ?? ""] ?? "ไม่ระบุ"}</span></td><td>{sale.soldBy}</td><td><strong>฿{money(sale.total)}</strong></td><td><button className="outline-button compact-button" disabled={detailLoading} onClick={() => void openSale(sale.id)}><ReceiptText size={15}/>ดูบิล</button></td></tr>)}</tbody></table><div className="pagination"><span>ทั้งหมด {total.toLocaleString("th-TH")} บิล · หน้า {page} / {totalPages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>ก่อนหน้า</button><button disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>ถัดไป</button></div></div></section>
    {detail && <ReceiptModal sale={detail} shop={shop} onClose={() => setDetail(null)} onCancelled={(cancelled) => { setDetail((current) => current ? { ...current, ...cancelled } : current); setNotice(`ยกเลิกบิล ${cancelled.invoiceNo} และคืนสต็อกเรียบร้อยแล้ว`); setRevision((current) => current + 1); }}/>}</>;
}

function ReceiptModal({ sale, shop, onClose, onCancelled, documentType="receipt", allowCancel=true }: { sale: SaleDetail; shop: ReceiptShop; onClose: () => void; onCancelled?: (sale: { invoiceNo: string; cancelled: boolean; cancelReason: string; cancelledAt: string; cancelledBy: string }) => void; documentType?:"receipt"|"tax-invoice";allowCancel?:boolean }) {
  const [editingBuyer, setEditingBuyer] = useState(false);
  const [invoiceBuyer, setInvoiceBuyer] = useState<TaxInvoiceBuyer>(() => ({ name: sale.customer?.name ?? "ลูกค้าทั่วไป", taxId: sale.customer?.taxId ?? "", address: [sale.customer?.address1, sale.customer?.address2].filter(Boolean).join(" ") }));
  const [cancelMode, setCancelMode] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);

  async function printReceipt() {
    if (printing) return;
    setPrinting(true);
    try {
      const response = await fetch("/api/receipt-print", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ sale, shop }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "ส่งงานพิมพ์ไม่สำเร็จ");
    } catch {
      window.alert("เชื่อมต่อตัวพิมพ์ BIXOLON ไม่สำเร็จ กรุณาเปิดตัวเชื่อมเครื่องพิมพ์");
    } finally {
      setPrinting(false);
    }
  }

  useEffect(() => {
    if(documentType==="tax-invoice")return;
    const browserPrint = window.print;
    window.print = () => { void printReceipt(); };
    return () => { window.print = browserPrint; };
  }, [sale, shop, printing, documentType]);

  async function cancelSale() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sale.id, reason }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "ยกเลิกบิลไม่สำเร็จ");
      onCancelled?.(payload.sale);
      setCancelMode(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ยกเลิกบิลไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  const isTaxInvoice=documentType==="tax-invoice";
  return <div className="modal-backdrop receipt-backdrop"><div className={`receipt-dialog ${isTaxInvoice?"tax-invoice-dialog":""}`}><div className="receipt-actions">{allowCancel&&!sale.cancelled && <button className="danger-button" onClick={() => setCancelMode(true)}><Trash2 size={16}/>ยกเลิกบิล</button>}{isTaxInvoice&&<button type="button" className="outline-button edit-tax-buyer-button" disabled={editingBuyer} onClick={()=>setEditingBuyer(true)}><UserRound size={17}/>แก้ไขข้อมูลลูกค้า</button>}<button className="cancel" onClick={onClose}><X size={17}/>ปิด</button><button className="primary" disabled={isTaxInvoice&&editingBuyer} onClick={() => window.print()}><Printer size={17}/>{isTaxInvoice?"พิมพ์ใบกำกับภาษี":"พิมพ์ใบเสร็จ"}</button></div>{isTaxInvoice&&editingBuyer&&<TaxInvoiceCustomerEditor buyer={invoiceBuyer} onApply={buyer=>{setInvoiceBuyer(buyer);setEditingBuyer(false)}} onCancel={()=>setEditingBuyer(false)}/>}{cancelMode && <div className="cancel-sale-panel"><div><strong>ยืนยันการยกเลิกบิล {sale.invoiceNo ?? sale.id}</strong><p>ระบบจะคืนสินค้าทุกรายการเข้าสต็อก การดำเนินการนี้ไม่สามารถยกเลิกย้อนหลังได้</p></div><textarea aria-label="เหตุผลการยกเลิกบิล" maxLength={200} placeholder="ระบุเหตุผลอย่างน้อย 3 ตัวอักษร" value={reason} onChange={(event) => setReason(event.target.value)}/>{error && <span>{error}</span>}<div><button className="cancel" disabled={submitting} onClick={() => { setCancelMode(false); setError(""); }}>ไม่ยกเลิก</button><button className="danger-confirm" disabled={submitting || reason.trim().length < 3} onClick={() => void cancelSale()}>{submitting ? "กำลังคืนสต็อก..." : "ยืนยันยกเลิกและคืนสต็อก"}</button></div></div>}<article className={`receipt-print ${isTaxInvoice?"tax-invoice-print":""}`}>{sale.cancelled && <div className="cancelled-stamp">ยกเลิกแล้ว</div>}<header><h2>{shop?.name ?? "UP Minimart"}</h2>{shop?.address1 && <p>{shop.address1} {shop.address2}</p>}{shop?.phone && <p>โทร. {shop.phone}</p>}{shop?.taxId && <p>เลขประจำตัวผู้เสียภาษี {shop.taxId}</p>}<h3>{isTaxInvoice?"ใบกำกับภาษี / ใบเสร็จรับเงิน":"ใบเสร็จรับเงิน"}</h3></header>{isTaxInvoice&&<div className="tax-customer-block"><strong>ข้อมูลผู้ซื้อ</strong><div><span>ชื่อ</span><b>{invoiceBuyer.name}</b></div><div><span>เลขประจำตัวผู้เสียภาษี</span><b>{invoiceBuyer.taxId||"-"}</b></div><div><span>ที่อยู่</span><b>{invoiceBuyer.address||"-"}</b></div></div>}{sale.cancelled && <div className="cancel-info">ยกเลิกโดย {sale.cancelledBy ?? "Administrator"} · {saleDate(sale.cancelledAt)}<br/>เหตุผล: {sale.cancelReason ?? "ไม่ระบุ"}</div>}<div className="receipt-meta"><div><span>เลขที่บิล</span><strong>{sale.invoiceNo ?? sale.id}</strong></div><div><span>วันที่</span><strong>{saleDate(sale.soldAt)}</strong></div><div><span>ลูกค้า</span><strong>{isTaxInvoice?invoiceBuyer.name:(sale.customer?.name ?? "ลูกค้าทั่วไป")}</strong></div><div><span>พนักงาน</span><strong>{sale.soldBy ?? "-"}</strong></div></div><table className={isTaxInvoice?undefined:"receipt-item-table"}><thead><tr><th>สินค้า</th><th>จำนวน</th><th>ราคา</th><th>รวม</th></tr></thead><tbody>{sale.items.map((item, index) => <tr key={`${item.code}-${index}`}><td><strong title={item.name}>{item.name}</strong>{isTaxInvoice&&<small>{item.code}</small>}{isTaxInvoice&&!!item.lots?.length&&<small className="receipt-item-lot">Lot {item.lots.map(lot=>lot.lotNo).join(", ")}</small>}</td><td>{item.quantity} {item.unit}</td><td>{money(item.unitPrice)}</td><td>{money(item.lineTotal)}</td></tr>)}</tbody></table><div className="receipt-summary"><div><span>ยอดก่อนส่วนลด</span><b>฿{money(sale.subtotal)}</b></div>{sale.discountAmount > 0 && <div><span>ส่วนลด</span><b>-฿{money(sale.discountAmount)}</b></div>}<div><span>ภาษีมูลค่าเพิ่ม (รวมในราคา)</span><b>฿{money(sale.vatAmount)}</b></div><div className="receipt-total"><span>ยอดชำระ</span><strong>฿{money(sale.total)}</strong></div><div><span>วิธีชำระ</span><b>{paymentLabels[sale.paymentType ?? ""] ?? "ไม่ระบุ"}</b></div>{sale.payments?.map(payment=><div className="receipt-payment-line" key={payment.method}><span>{paymentMethodLabels[payment.method]??payment.method}{payment.reference?` · ${payment.reference}`:""}</span><b>฿{money(payment.amount)}</b>{payment.method==="cash"&&payment.receivedAmount!==null&&<small>รับมา ฿{money(payment.receivedAmount)} · เงินทอน ฿{money(payment.changeAmount??0)}</small>}</div>)}</div><footer>ขอบคุณที่ใช้บริการ</footer></article></div></div>;
}

function Purchasing(){return <><PageTitle title="จัดซื้อและรับเข้า" desc="ติดตามใบสั่งซื้อและการรับสินค้าเข้าสต็อก" action="สร้างใบสั่งซื้อ" icon={Plus}/><div className="mini-metrics"><Mini title="รออนุมัติ" value="3 ใบ" icon={ClipboardList} color="orange"/><Mini title="รอรับสินค้า" value="5 ใบ" icon={Truck} color="blue"/><Mini title="ยอดจัดซื้อเดือนนี้" value="฿68,420" icon={CircleDollarSign} color="green"/></div><section className="panel table-panel"><div className="panel-head pad"><div><h3>ใบสั่งซื้อล่าสุด</h3><p>รายการจัดซื้อจากผู้จำหน่าย</p></div><button className="text-button">ดูทั้งหมด</button></div><table><thead><tr><th>เลขที่ PO</th><th>ผู้จำหน่าย</th><th>วันที่สั่งซื้อ</th><th>กำหนดส่ง</th><th>ยอดรวม</th><th>สถานะ</th></tr></thead><tbody>{[['PO-6908-0012','บริษัท ไทยเบฟเวอเรจ จำกัด','8 ส.ค. 2569','10 ส.ค. 2569','฿12,850.00','รอรับสินค้า'],['PO-6908-0011','บริษัท สหพัฒนพิบูล จำกัด','7 ส.ค. 2569','9 ส.ค. 2569','฿8,420.00','รับบางส่วน'],['PO-6908-0010','บริษัท ซีพี ออลล์ จำกัด','5 ส.ค. 2569','7 ส.ค. 2569','฿15,780.00','รับครบแล้ว']].map(r=><tr key={r[0]}><td><strong className="link">{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><strong>{r[4]}</strong></td><td><span className={`status ${r[5]==='รับครบแล้ว'?'ok':'pending'}`}>{r[5]}</span></td></tr>)}</tbody></table></section></>}

function Customers(){return <><PageTitle title="ลูกค้าและลูกหนี้" desc="จัดการข้อมูลลูกค้า เครดิต และการรับชำระ" action="เพิ่มลูกค้า" icon={Plus}/><div className="mini-metrics"><Mini title="ลูกค้าทั้งหมด" value="248 ราย" icon={Users} color="blue"/><Mini title="ยอดลูกหนี้คงค้าง" value="฿42,680" icon={HandCoins} color="orange"/><Mini title="เกินกำหนดชำระ" value="฿8,250" icon={Clock3} color="red"/></div><section className="panel table-panel"><div className="panel-head pad"><div><h3>ลูกหนี้คงค้าง</h3><p>ติดตามยอดค้างและวันครบกำหนด</p></div><button className="outline-button"><ReceiptText size={16}/>รับชำระหนี้</button></div><table><thead><tr><th>ลูกค้า</th><th>เลขที่เอกสาร</th><th>วันที่ขาย</th><th>ครบกำหนด</th><th>ยอดค้าง</th><th>สถานะ</th></tr></thead><tbody>{[['บริษัท สมาร์ทช็อป จำกัด','IV-6908-0032','1 ส.ค. 2569','16 ส.ค. 2569','฿12,500.00','ยังไม่ครบกำหนด'],['ร้านบ้านสวน','IV-6907-0098','20 ก.ค. 2569','4 ส.ค. 2569','฿5,750.00','เกินกำหนด'],['คุณพิมพ์ชนก ใจดี','IV-6908-0027','3 ส.ค. 2569','18 ส.ค. 2569','฿3,240.00','ยังไม่ครบกำหนด']].map(r=><tr key={r[1]}><td><strong>{r[0]}</strong></td><td className="link">{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><strong>{r[4]}</strong></td><td><span className={`status ${r[5]==='เกินกำหนด'?'low':'pending'}`}>{r[5]}</span></td></tr>)}</tbody></table></section></>}

function Reports(){return <><PageTitle title="รายงาน" desc="วิเคราะห์ยอดขาย สต็อก และภาษีของร้าน"/><div className="report-grid">{[[BarChart3,'รายงานยอดขาย','ยอดขายรายวัน รายเดือน และแยกตามพนักงาน','green'],[TrendingUp,'สินค้าขายดี','อันดับสินค้าและกำไรตามช่วงเวลา','blue'],[Boxes,'รายงานสต็อก','สินค้าคงเหลือและความเคลื่อนไหว','purple'],[ReceiptText,'รายงานภาษีขาย','สรุปภาษีขายและใบกำกับภาษี','orange'],[ClipboardList,'รายงานภาษีซื้อ','สรุปภาษีซื้อจากการรับสินค้า','red'],[WalletCards,'สรุปเงินประจำวัน','เงินสด โอน เช็ค และยอดนำส่ง','teal']].map(([Icon,title,desc,color])=>{const C=Icon as typeof Store;return <button className="report-card" key={String(title)}><span className={String(color)}><C size={24}/></span><div><strong>{String(title)}</strong><p>{String(desc)}</p></div><ArrowUpRight size={18}/></button>})}</div></>}

function PageTitle({title,desc,action,icon:Icon,onAction}: {title:string;desc:string;action?:string;icon?:typeof Store;onAction?:()=>void}){return <div className="page-title"><div><h2>{title}</h2><p>{desc}</p></div>{action&&<button className="primary" onClick={onAction}>{Icon&&<Icon size={18}/>} {action}</button>}</div>}
function Mini({title,value,icon:Icon,color}:{title:string;value:string;icon:typeof Store;color:string}){return <div className="mini-card"><span className={color}><Icon size={21}/></span><div><p>{title}</p><strong>{value}</strong></div></div>}

function HeldBillsModal({cart,customer,onClose,onHeld,onRestore,onDeleted}:{cart:CartLine[];customer:CustomerChoice|null;onClose:()=>void;onHeld:()=>void;onRestore:(cart:CartLine[],customer:CustomerChoice|null)=>void;onDeleted:()=>void}) {
  const [bills,setBills]=useState<HeldBill[]>([]);
  const [label,setLabel]=useState(customer?.name??"");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [busyId,setBusyId]=useState<number|null>(null);
  const [error,setError]=useState("");

  async function loadBills(){
    setLoading(true);setError("");
    try{const response=await fetch("/api/held-bills",{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload.message??"โหลดบิลที่พักไว้ไม่สำเร็จ");setBills(payload.items??[])}
    catch(cause){setError(cause instanceof Error?cause.message:"โหลดบิลที่พักไว้ไม่สำเร็จ")}
    finally{setLoading(false)}
  }
  useEffect(()=>{void loadBills()},[]);

  async function holdCurrent(){
    if(submitting||cart.length===0||!label.trim())return;
    setSubmitting(true);setError("");
    try{const response=await fetch("/api/held-bills",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:label.trim(),items:cart,customer})});const payload=await response.json();if(!response.ok)throw new Error(payload.message??"พักบิลไม่สำเร็จ");setBills(old=>[...old,payload.heldBill]);setLabel("");onHeld()}
    catch(cause){setError(cause instanceof Error?cause.message:"พักบิลไม่สำเร็จ")}
    finally{setSubmitting(false)}
  }

  async function removeBill(id:number,restoring=false){
    setBusyId(id);setError("");
    try{const response=await fetch(`/api/held-bills?id=${id}`,{method:"DELETE"});const payload=await response.json();if(!response.ok)throw new Error(payload.message??"ลบบิลพักไม่สำเร็จ");setBills(old=>old.filter(bill=>bill.id!==id));onDeleted();return true}
    catch(cause){setError(cause instanceof Error?cause.message:restoring?"เรียกคืนบิลไม่สำเร็จ":"ลบบิลพักไม่สำเร็จ");return false}
    finally{setBusyId(null)}
  }

  async function restore(bill:HeldBill){
    if(cart.length>0&&!window.confirm("การเรียกคืนจะนำรายการจากบิลพักมาแทนรายการขายปัจจุบัน ต้องการดำเนินการต่อหรือไม่?"))return;
    if(await removeBill(bill.id,true))onRestore(bill.items,bill.customer??null);
  }

  const heldDate=(value:string)=>new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Bangkok"}).format(new Date(value));
  const currentTotal=cart.reduce((sum,item)=>sum+item.price*item.qty,0);
  return <div className="modal-backdrop"><section className="held-bills-modal"><header><div><span>จัดการรายการระหว่างขาย</span><h2>พักบิล / เรียกคืนบิล</h2></div><button aria-label="ปิด" onClick={onClose} disabled={submitting||busyId!==null}><X size={20}/></button></header><div className="held-bills-body">{cart.length>0&&<div className="hold-current-card"><div className="hold-current-summary"><span><Pause size={20}/></span><div><strong>พักรายการขายปัจจุบัน</strong><small>{cart.length.toLocaleString("th-TH")} รายการ · {cart.reduce((sum,item)=>sum+item.qty,0).toLocaleString("th-TH")} ชิ้น · ฿{money(currentTotal)}</small></div></div><div className="hold-name-row"><label><span>ชื่อลูกค้า / ชื่อเรียกบิล</span><input autoFocus maxLength={80} value={label} onChange={event=>setLabel(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void holdCurrent()}} placeholder="เช่น คุณสมชาย หรือ โต๊ะ 2"/></label><button disabled={submitting||!label.trim()} onClick={()=>void holdCurrent()}>{submitting?"กำลังพัก...":<><Pause size={17}/> พักบิลนี้</>}</button></div><p>ระบบจะเก็บรายการไว้โดยยังไม่ตัดสต็อก และเปิดตะกร้าใหม่สำหรับลูกค้าคนถัดไป</p></div>}<div className="held-list-heading"><div><strong>บิลที่พักไว้</strong><span>{bills.length.toLocaleString("th-TH")} บิล</span></div><button onClick={()=>void loadBills()} disabled={loading||busyId!==null}>รีเฟรช</button></div>{error&&<div className="payment-error">{error}</div>}{loading?<div className="held-empty">กำลังโหลดบิลที่พักไว้...</div>:bills.length===0?<div className="held-empty"><ListRestart size={31}/><strong>ยังไม่มีบิลที่พักไว้</strong><span>เมื่อพักบิล รายการจะปรากฏที่นี่เพื่อเรียกคืนภายหลัง</span></div>:<div className="held-bill-list">{bills.map(bill=><article key={bill.id}><div className="held-bill-main"><span className="held-bill-number">#{bill.id}</span><div><strong>{bill.label}</strong><small>พักเมื่อ {heldDate(bill.createdAt)} น. · โดย {bill.heldBy??"ไม่ระบุ"}</small></div><b>฿{money(bill.total)}</b></div><div className="held-bill-detail"><span>{bill.items.length.toLocaleString("th-TH")} รายการ · {bill.itemCount.toLocaleString("th-TH")} ชิ้น</span><div><button className="held-delete" disabled={busyId!==null} onClick={()=>{if(window.confirm(`ลบบิลพัก “${bill.label}” หรือไม่?`))void removeBill(bill.id)}}><Trash2 size={15}/> ลบ</button><button className="held-restore" disabled={busyId!==null} onClick={()=>void restore(bill)}>{busyId===bill.id?"กำลังดำเนินการ...":<><Play size={15}/> เรียกคืนบิล</>}</button></div></div></article>)}</div>}</div><footer><button onClick={onClose} disabled={submitting||busyId!==null}>ปิด</button></footer></section></div>
}

function RealPayment({ cart, total, customer, onClose, onSuccess }: { cart: CartLine[]; total: number; customer:CustomerChoice|null;onClose: () => void; onSuccess: (sale: SaleResult) => void }) {
  const submitLock = useRef(false);
  const [payments,setPayments]=useState<PaymentPayload[]>([]);
  const [paymentValid,setPaymentValid]=useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const paymentChanged=useCallback((next:PaymentPayload[],valid:boolean)=>{setPayments(next);setPaymentValid(valid)},[]);

  async function submitSale() {
    if (submitLock.current || submitting || !paymentValid || cart.length === 0) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments, customerCode:customer?.code??null, items: cart.map((item) => ({ code: item.code, qty: item.qty, unitId: item.unitId, lotId: item.selectedLot?.id ?? null, scannedBarcode: item.scannedBarcode })) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "บันทึกการขายไม่สำเร็จ");
      onSuccess(payload.sale as SaleResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกการขายไม่สำเร็จ");
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return <div className="modal-backdrop"><form className="payment-modal split-payment-modal" onSubmit={event=>{event.preventDefault();void submitSale()}} onKeyDown={event=>{if(event.key==="Enter"&&(event.repeat||event.nativeEvent.isComposing))event.preventDefault()}}><div className="modal-head"><div><span>ชำระเงินและบันทึกบิล</span><h2>ยอดชำระ ฿{money(total)}</h2></div><button type="button" onClick={onClose} disabled={submitting}><X size={20}/></button></div><div className="payment-body"><PaymentEditor total={total} onChange={paymentChanged}/>{error && <div className="payment-error">{error}</div>}</div><div className="modal-footer"><button type="button" className="cancel" onClick={onClose} disabled={submitting}>ยกเลิก</button><button type="submit" className="confirm" disabled={submitting||!paymentValid}>{submitting ? "กำลังบันทึก..." : <><Check size={19}/>ยืนยันและบันทึกการขาย <kbd>Enter</kbd></>}</button></div></form></div>;
}

function Payment({ total, onClose, onSuccess }: {total:number;onClose:()=>void;onSuccess:()=>void}) {
  const [method,setMethod]=useState('cash'); const [received,setReceived]=useState(String(Math.ceil(total/100)*100));
  const change=Math.max(0,Number(received||0)-total);
  return <div className="modal-backdrop"><div className="payment-modal"><div className="modal-head"><div><span>ชำระเงิน</span><h2>ยอดชำระ ฿{money(total)}</h2></div><button onClick={onClose}><X size={20}/></button></div><div className="payment-body"><p className="field-label">เลือกวิธีชำระเงิน</p><div className="payment-methods"><button className={method==='cash'?'active':''} onClick={()=>setMethod('cash')}><CircleDollarSign size={23}/><strong>เงินสด</strong></button><button className={method==='transfer'?'active':''} onClick={()=>setMethod('transfer')}><ScanBarcode size={23}/><strong>QR / โอน</strong></button><button className={method==='card'?'active':''} onClick={()=>setMethod('card')}><CreditCard size={23}/><strong>บัตร/โครงการรัฐ</strong></button></div>{method==='cash'&&<><label className="field-label" htmlFor="received">รับเงินมา</label><div className="money-input"><span>฿</span><input id="received" type="number" value={received} onChange={e=>setReceived(e.target.value)}/></div><div className="cash-chips">{[total,Math.ceil(total/100)*100,500,1000].filter((v,i,a)=>a.indexOf(v)===i).map(v=><button onClick={()=>setReceived(String(v))} key={v}>฿{money(v)}</button>)}</div><div className="change-row"><span>เงินทอน</span><strong>฿{money(change)}</strong></div></>}</div><div className="modal-footer"><button className="cancel" onClick={onClose}>ยกเลิก</button><button className="confirm" onClick={onSuccess} disabled={method==='cash'&&Number(received)<total}><Check size={19}/>ยืนยันการชำระเงิน</button></div></div></div>;
}
