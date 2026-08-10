"""
extract_origin.py —— 从 Origin 项目 (.opju) 一键导出所有工作表为 CSV
=====================================================================
通过 Origin 的 COM 接口（originpro）读取项目，把每个工作表写成 CSV。
需要：本机已安装并可启动 Origin；Python 装好 originpro + pywin32。

用法：
    python extract_origin.py
导出的 CSV 默认放在 .opju 同级的 origin_export/ 目录。

注意：此脚本仅做【数据导出】用途，不涉及其他操作。
=====================================================================
"""
import os
import win32com.client
import originpro as op

# ↓↓↓ 改成你自己的 .opju 路径 ↓↓↓
SRC = r'D:/实验/催化剂/PtCo/有序化合金/分步还原/EC-30-PtCo-Step1/EC-30-PtCo-Step1.opju'
# ↑↑↑

OUT = os.path.join(os.path.dirname(SRC), 'origin_export')
os.makedirs(OUT, exist_ok=True)


def export_sheet(wks, out_name):
    df = wks.to_df()
    if df.shape[0] == 0:
        return False
    csv = os.path.join(OUT, out_name + '.csv')
    df.to_csv(csv, index=False)
    print(f'  -> {csv}  shape={df.shape}  cols={list(df.columns)}')
    return True


def main():
    app = win32com.client.Dispatch('Origin.ApplicationSI')
    op.attach()
    ok = op.open(SRC, readonly=True, asksave=False)
    if not ok:
        print('打开项目失败:', SRC)
        return

    print('开始导出工作表...')
    i = 1
    while True:
        bk = op.find_book('w', i)
        if bk is None:
            break
        bn = bk.name
        got = False
        # 先尝试标准 Sheet1..Sheet25
        for j in range(1, 26):
            wks = op.find_sheet('w', f'[{bn}]Sheet{j}')
            if wks is None:
                break
            if export_sheet(wks, f'{bn}_Sheet{j}'):
                got = True
        # 兜底：若没有任何 SheetN（如表名为自定义，如 "O2 LSV"），取当前表
        if not got:
            bk.activate()
            wks = op.find_sheet('w')
            if wks is not None:
                export_sheet(wks, f'{bn}_active')
        i += 1
    print('导出完成，目录：', OUT)


if __name__ == '__main__':
    main()
