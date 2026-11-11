import { z } from 'zod';
import { HttpError } from './policy.ts';
z.config(z.locales.pt());
export const safeUrl = z.string().max(2048).refine(value => {
 if (!value) return true;
 try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
},'Use uma URL http(s) válida, sem credenciais.');
const text = (max=10000) => z.string().trim().max(max);
export const profileSchema = z.object({displayName:text(100).min(2),city:text(100).default(''),photoUrl:safeUrl.default(''),wcaId:z.string().regex(/^(?:[0-9]{4}[A-Z]{4}[0-9]{2})?$/).default('')});
export const registerSchema = profileSchema.extend({email:z.email().max(254).transform(e=>e.toLowerCase()),password:z.string().min(12).max(256)});
export const loginSchema = z.object({email:z.email().max(254).transform(e=>e.toLowerCase()),password:z.string().min(1).max(256)});
export const eventSchema = z.object({name:text(160).min(2),description:text(20000).default(''),rules:text(20000).default(''),registrationOpen:z.iso.datetime({offset:true}),registrationClose:z.iso.datetime({offset:true})});
export const eventPatchSchema = eventSchema.partial().extend({status:z.enum(['DRAFT','OPEN','RUNNING','CLOSED']).optional()});
export const roundSchema = z.object({name:text(160).min(2),puzzle:z.enum(['333','222','pyram']),format:z.enum(['AO5','MO3']),opensAt:z.iso.datetime({offset:true}),closesAt:z.iso.datetime({offset:true}),videoRequired:z.boolean().default(false)});
export const attemptSchema = z.object({timeCs:z.number().int().positive().max(8640000).nullable(),penalty:z.enum(['NONE','PLUS2','DNF'])}).refine(a=>a.timeCs!==null || a.penalty==='DNF','Tempo obrigatório sem DNF.');
export const submissionSchema = z.object({attempts:z.array(attemptSchema).min(3).max(5),videoUrl:safeUrl.default('')});
export const algorithmSchema = z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional(),name:text(160).min(1),category:z.enum(['F2L','OLL','PLL']),algorithm:text(5000).min(1),variations:z.array(text(5000)).max(50).default([]),orientation:text(5000).default(''),notes:text(10000).default(''),sourceUrl:safeUrl.default(''),sourceName:text(300).default(''),validated:z.boolean().default(false),method:z.literal('CFOP').default('CFOP'),puzzle:z.literal('333').default('333'),arrows:z.string().max(2000).regex(/^(?:[A-Z][a-z]?[0-9]{1,2}->[A-Z][a-z]?[0-9]{1,2}:#[0-9a-fA-F]{6}(?:,(?=[A-Z])|$))*$/,'Setas inválidas.').default('')});
export const contentKeys = ['communityName','communityShortName','logoUrl','history','objectives','meetings','welcome','whatsappUrl','instagramUrl','contactEmail','communityPhotoUrl','communityPhotoAlt','developerBio','developerPhotoUrl','portfolioUrl','githubUrl','linkedinUrl','developerContact'] as const;
export const contentSchema = z.object(Object.fromEntries(contentKeys.map(key=>[key,key.endsWith('Url') ? safeUrl.optional() : text(30000).optional()])) as Record<typeof contentKeys[number],z.ZodOptional<z.ZodString | typeof safeUrl>>).strict();
export const uuid = z.uuid();
export function parse<T>(schema:z.ZodType<T>,value:unknown):T {
 const result=schema.safeParse(value);
 if(!result.success) throw new HttpError(400,result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
 return result.data;
}
// Zod 4 applies nested defaults even inside .partial(); PATCH must retain only supplied keys.
export function parsePatch<T extends Record<string,unknown>>(schema:z.ZodType<T>,value:unknown):T {
 const parsed=parse(schema,value);
 return Object.fromEntries(Object.entries(parsed).filter(([key])=>Object.hasOwn(value as object,key))) as T;
}
export async function body(request:Request) {
 const length = Number(request.headers.get('content-length') || 0);
 if(length>100000) throw new HttpError(413,'Corpo muito grande.');
 const reader=request.body?.getReader(); if(!reader) return {};
 let size=0; const chunks:Uint8Array[]=[];
 while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>100000){await reader.cancel();throw new HttpError(413,'Corpo muito grande.');} chunks.push(value); }
 try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {throw new HttpError(400,'JSON inválido.');}
}
