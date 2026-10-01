import {expect,it} from 'vitest';
import {getWebsiteIcon,searchWebsiteIcons} from '../server/websiteIcons';

it('finds and returns real installed Phosphor SVGs',async()=>{
 const matches=searchWebsiteIcons('globe',12);
 expect(matches.items.some(icon=>icon.slug==='globe')).toBe(true);
 const icon=await getWebsiteIcon('globe','regular');
 expect(icon.name).toBe('Globe');
 expect(icon.svg).toContain('<svg');
 expect(icon.svg).toContain('currentColor');
 await expect(getWebsiteIcon('made-up-icon','regular')).rejects.toMatchObject({code:'website_icon'});
});
