import { requireSupabase } from './supabaseClient.js'
import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabaseClient.js', () => ({ requireSupabase: vi.fn() }))
import { eventReportImagePaths, reportImageDetails, listActiveInformationEvents, informationDraftForUser } from './campusInformation.js'
const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg'
describe('reviewed event photos', () => {
 it('uses only reviewed source reports of the same event', () => {
   expect(eventReportImagePaths([{ event_id: 'event', status: 'submitted', details: { image_paths: [path] } }, { event_id: 'other', status: 'published', details: { image_paths: [path] } }], 'event')).toEqual([])
   expect(eventReportImagePaths([{ event_id: 'event', status: 'published', details: { image_paths: [path] } }], 'event')).toEqual([path])
 })
 it('ignores arbitrary URL input and deduplicates repeated reports', () => {
   expect(eventReportImagePaths([{ event_id: 'event', status: 'published', details: { image_paths: ['https://external.test/x'] } }], 'event')).toEqual([])
   const report = { event_id: 'event', status: 'published', details: { image_paths: [path] } }
   expect(eventReportImagePaths([report, report], 'event')).toEqual([path])
 })
})


describe('report attachment submission', () => {
 it('preserves report details and limits inherited plus newly selected images together', () => {
   const second = path.replace('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
   const details = {contact:'fixture', image_paths:[path]};
   expect(reportImageDetails(details,[second],path.split('/')[0])).toEqual({contact:'fixture', image_paths:[path,second]});
   expect(details.image_paths).toEqual([path]);
   expect(()=>reportImageDetails(details,[second,second.replace('33333333','44444444'),second.replace('33333333','55555555')],path.split('/')[0])).toThrow('3');
 });
 it('rejects stolen and malformed references before calling the report RPC', () => {
   expect(()=>reportImageDetails({image_paths:[path]},[],'66666666-6666-4666-8666-666666666666')).toThrow();
   expect(()=>reportImageDetails({image_paths:['https://external.test/x']},[],path.split('/')[0])).toThrow();
   expect(reportImageDetails({contact:'fixture'},[],path.split('/')[0])).toEqual({contact:'fixture'});
 });
});


it('loads an active event photo from its own reports independently of the newest report feed', async () => {
 const row={id:'older-active-event',title:'仍有效的通知',image_reports:[{event_id:'older-active-event',status:'published',details:{image_paths:[path]}}]};
 const query={then:(resolve)=>Promise.resolve({data:[row],error:null}).then(resolve)};
 for(const method of ['select','eq','gt','order','limit']) query[method]=vi.fn(()=>query);
 const client={from:vi.fn(()=>query)};requireSupabase.mockReturnValue(client);
 const events=await listActiveInformationEvents();
 expect(events[0].imagePaths).toEqual([path]);
 expect(query.select.mock.calls[0][0]).toContain('campus_reports!campus_reports_event_id_fkey');
 expect(query.eq).toHaveBeenCalledWith('image_reports.status','published');
 expect(client.from).toHaveBeenCalledTimes(1);
});


it('keeps chat-derived report drafts inside their account while allowing a guest location draft after login',()=>{
 const a=path.split('/')[0], b='99999999-9999-4999-8999-999999999999';
 const draft={body:'账户自己的聊天',sourceMessageId:'message',details:{image_paths:[path]}};
 expect(informationDraftForUser({userId:a,draft},a)).toBe(draft);
 expect(informationDraftForUser({userId:a,draft},b)).toBeUndefined();
 expect(informationDraftForUser({userId:a,draft},null)).toBeUndefined();
 expect(informationDraftForUser({userId:null,draft:{kind:'notice',locationId:'library'}},b)).toEqual({kind:'notice',locationId:'library'});
 expect(informationDraftForUser({userId:null,draft},b)).toBeUndefined();
});
