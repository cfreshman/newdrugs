import {expect,it} from 'vitest';
import {formatLocationLabel} from '../shared/locationLabel';
it('abbreviates the country everywhere and the state only when compact',()=>{
 expect(formatLocationLabel('East Providence area, Rhode Island, US')).toBe('East Providence, Rhode Island, US');
 expect(formatLocationLabel('Rhode Island, United States')).toBe('Rhode Island, US');
 expect(formatLocationLabel('Lincoln area, Rhode Island, United States',true)).toBe('Lincoln, RI, US');
 expect(formatLocationLabel('New York, New York, United States of America',true)).toBe('New York, NY, US');
 expect(formatLocationLabel('Washington, District of Columbia, US',true)).toBe('Washington, DC, US');
});
it('preserves international locations and already abbreviated US areas',()=>{
 expect(formatLocationLabel('Tbilisi, Georgia',true)).toBe('Tbilisi, Georgia');
 expect(formatLocationLabel('Mexico City, Mexico',true)).toBe('Mexico City, Mexico');
 expect(formatLocationLabel('Providence, RI, US',true)).toBe('Providence, RI, US');
 expect(formatLocationLabel(undefined,true)).toBe('');
});
