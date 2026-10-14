import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
class CustomerError extends Error { constructor(message:string,readonly status=400){super(message)} }
const value=(input:unknown,max:number)=>{const result=String(input??"").trim();if(result.length>max)throw new CustomerError(`ข้อมูลยาวเกิน ${max} ตัวอักษร`);return result||null};
const normalizedPhone=(phone:string)=>phone.replace(/[^0-9]/g,"");

function customerData(body:Record<string,unknown>){
  const name=String(body.name??"").trim(),phone=String(body.phone??"").trim(),digits=normalizedPhone(phone);
  if(!name||!phone)throw new CustomerError("กรุณาระบุชื่อลูกค้าและโทรศัพท์");
  if(name.length>80||phone.length>40||!digits)throw new CustomerError("ชื่อหรือหมายเลขโทรศัพท์ไม่ถูกต้อง");
  const creditDays=Number(body.creditDays??0),priceLevel=Number(body.priceLevel??0);
  if(!Number.isInteger(creditDays)||creditDays<0||creditDays>3650)throw new CustomerError("เครดิตต้องเป็นจำนวนวันระหว่าง 0–3,650");
  if(!Number.isInteger(priceLevel)||priceLevel<0||priceLevel>4)throw new CustomerError("ระดับราคาต้องอยู่ระหว่าง 0–4");
  return {name,phone,address1:value(body.address1,70),address2:value(body.address2,70),fax:value(body.fax,40),email:value(body.email,50),contact:value(body.contact,40),priceLevel,creditDays,taxId:value(body.taxId,25),detail:value(body.detail,200)};
}

export async function GET(request:Request){
  const search=new URL(request.url).searchParams.get("search")?.trim();
  try{const rows=await prisma.customer.findMany({where:search?{OR:[{code:{contains:search,mode:"insensitive"}},{name:{contains:search,mode:"insensitive"}},{phone:{contains:search}},{email:{contains:search,mode:"insensitive"}},{taxId:{contains:search}}]}:{},orderBy:[{name:"asc"},{code:"asc"}],take:500,include:{_count:{select:{sales:true,receivables:true}}}});return Response.json({items:rows.map(({_count,...row})=>({...row,saleCount:_count.sales,receivableCount:_count.receivables})),total:rows.length})}catch(error){console.error("Load customer directory failed",error);return Response.json({message:"โหลดข้อมูลลูกค้าไม่สำเร็จ"},{status:500})}
}

export async function POST(request:Request){let body:Record<string,unknown>;try{body=await request.json()}catch{return Response.json({message:"ข้อมูลไม่ถูกต้อง"},{status:400})}try{const data=customerData(body),digits=normalizedPhone(data.phone);const duplicate=await prisma.$queryRaw<Array<{code:string}>>`SELECT "code" FROM "customers" WHERE regexp_replace(COALESCE("phone",''),'[^0-9]','','g')=${digits} LIMIT 1`;if(duplicate.length)throw new CustomerError("หมายเลขโทรศัพท์นี้มีลูกค้าใช้งานแล้ว",409);const customer=await prisma.$transaction(async tx=>{const sequence=await tx.$queryRaw<Array<{value:bigint}>>`SELECT nextval('customer_number_seq') AS value`;const number=Number(sequence[0]?.value??0);if(number<1||number>999999)throw new CustomerError("เลขที่ลูกค้าอัตโนมัติครบจำนวนแล้ว",409);return tx.customer.create({data:{code:String(number).padStart(6,"0"),...data}})});return Response.json({customer},{status:201})}catch(error){return customerResponse(error,"เพิ่มลูกค้าไม่สำเร็จ")}}

export async function PATCH(request:Request){let body:Record<string,unknown>;try{body=await request.json()}catch{return Response.json({message:"ข้อมูลไม่ถูกต้อง"},{status:400})}try{const code=String(body.code??"").trim(),data=customerData(body),digits=normalizedPhone(data.phone);if(!code)throw new CustomerError("ไม่พบรหัสลูกค้า");const duplicate=await prisma.$queryRaw<Array<{code:string}>>`SELECT "code" FROM "customers" WHERE regexp_replace(COALESCE("phone",''),'[^0-9]','','g')=${digits} AND "code"<>${code} LIMIT 1`;if(duplicate.length)throw new CustomerError("หมายเลขโทรศัพท์นี้มีลูกค้าใช้งานแล้ว",409);const result=await prisma.customer.updateMany({where:{code},data});if(!result.count)throw new CustomerError("ไม่พบลูกค้า",404);return Response.json({success:true})}catch(error){return customerResponse(error,"แก้ไขลูกค้าไม่สำเร็จ")}}

export async function DELETE(request:Request){const code=new URL(request.url).searchParams.get("code")?.trim();if(!code)return Response.json({message:"กรุณาระบุลูกค้า"},{status:400});try{const customer=await prisma.customer.findUnique({where:{code},select:{_count:{select:{sales:true,receivables:true}}}});if(!customer)throw new CustomerError("ไม่พบลูกค้า",404);if(customer._count.sales||customer._count.receivables)throw new CustomerError("ลูกค้านี้มีประวัติการขายหรือลูกหนี้แล้ว จึงไม่สามารถลบได้",409);await prisma.customer.delete({where:{code}});return Response.json({success:true})}catch(error){return customerResponse(error,"ลบลูกค้าไม่สำเร็จ")}}

function customerResponse(error:unknown,fallback:string){if(error instanceof CustomerError)return Response.json({message:error.message},{status:error.status});if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return Response.json({message:"หมายเลขโทรศัพท์นี้มีลูกค้าใช้งานแล้ว"},{status:409});console.error(fallback,error);return Response.json({message:fallback},{status:500})}
