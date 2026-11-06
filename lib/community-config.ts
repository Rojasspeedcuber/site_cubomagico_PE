import initial from '../data/content.json' with { type: 'json' };

export const SITE_URL = 'https://cubomagicope.rojasdev.site';
export const SUPPORT_EMAIL = 'henriquer01@rojasdev.cloud';
export const OFFICIAL_LOGO_PATH = '/imgs/logo-cubo-pe.jpeg';
export function resolveContent(rows: { key: string; value: string }[]): Record<string, string> {
 const content: Record<string, string> = {...initial};
 if(process.env.COMMUNITY_NAME) content.communityName=process.env.COMMUNITY_NAME;
 for(const {key,value} of rows) if(Object.hasOwn(initial,key)) content[key]=value;
 return content;
}
