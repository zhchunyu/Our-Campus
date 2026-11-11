from pathlib import Path
import json, statistics, sys

if len(sys.argv)<3:
    print('用法：python 汇总真实记录.py 实际记录目录 输出JSON路径；不会生成模拟数据。')
    raise SystemExit(0)

source=Path(sys.argv[1]);target=Path(sys.argv[2])
if target.exists():raise SystemExit('输出文件已存在，请使用新路径，避免覆盖原始记录。')
records=[];errors=[]
for p in sorted(source.glob('*.json')):
    try:
        value=json.loads(p.read_text('utf-8'))
        if value.get('schema')!='OurCampus-real-user-record-v1':continue
        if value.get('consent')=='不同意竞赛材料使用':continue
        if value.get('consent') not in ['同意匿名统计及匿名评价引用','仅同意匿名统计，不引用评价']:raise ValueError('缺少有效用途选择')
        if not value.get('participant_id') or not value.get('date'):raise ValueError('缺少匿名编号或日期')
        records.append(value)
    except Exception as e:errors.append({'file':p.name,'error':str(e)})
ids=[x['participant_id'] for x in records]
if len(ids)!=len(set(ids)):raise SystemExit('发现重复匿名编号；先人工确认重复/多轮记录，再汇总。')
summary={'data_origin':'真实记录文件的汇总，程序不验证实际参加身份','record_count':len(records),'errors':errors,'tasks':{},'quotes':[]}
for task in ['T1','T2','T3']:
    methods={}
    for method in ['app','comparison']:
        key=f'{task}_{method}';executed=[x for x in records if x.get(key+'_result') in ['成功','失败','中止']];passed=[x for x in executed if x[key+'_result']=='成功'];times=[]
        for x in passed:
            try:times.append(float(x[key+'_seconds']))
            except (KeyError,ValueError):errors.append({'participant':x['participant_id'],'error':key+'成功但缺少时间'})
        methods[method]={'executed':len(executed),'success':len(passed),'failed_or_stopped':len(executed)-len(passed),'median_success_seconds':statistics.median(times) if times else None,'missing_success_times':len(passed)-len(times)}
    paired=[]
    for x in records:
        if x.get(task+'_app_result')=='成功' and x.get(task+'_comparison_result')=='成功':
            try:paired.append(float(x[task+'_comparison_seconds'])-float(x[task+'_app_seconds']))
            except (KeyError,ValueError):pass
    methods['paired_difference']={'definition':'对照秒数减App秒数，正值表示App更快；仅两种方式都成功且时间完整的配对','pairs':len(paired),'median_seconds':statistics.median(paired) if paired else None}
    summary['tasks'][task]=methods
for x in records:
    if x.get('consent')=='同意匿名统计及匿名评价引用':
        summary['quotes'].append({'participant_id':x['participant_id'],'helpful_example':x.get('helpful_example',''),'improvement':x.get('improvement','')})
target.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n','utf-8')
print(f'有效实际记录：{len(records)}；输出：{target}')
