"""
extract_origin.py —— 从 Origin 项目 (.opju) 一键导出所有工作表为 CSV
=====================================================================
通过 Origin 的 COM 接口（originpro）读取项目，把每个工作表写成 CSV。
需要：本机已安装并可启动 Origin；Python 装好 originpro + pywin32。

用法：
    python extract_origin.py path/to/project.opju
    python extract_origin.py path/to/project.opju --output path/to/output
导出的 CSV 默认放在 .opju 同级的 origin_export/ 目录。

注意：此脚本仅做【数据导出】用途，不涉及其他操作。
=====================================================================
"""
import argparse
from pathlib import Path


def export_sheet(wks, out_name, output_dir):
    df = wks.to_df()
    if df.shape[0] == 0:
        return False
    csv = output_dir / (out_name + '.csv')
    df.to_csv(csv, index=False)
    print(f'  -> {csv}  shape={df.shape}  cols={list(df.columns)}')
    return True


def main():
    parser = argparse.ArgumentParser(description="Export Origin project worksheets to CSV.")
    parser.add_argument("project", type=Path, help="Path to the .opju project")
    parser.add_argument("--output", type=Path, help="Output directory (default: origin_export beside the project)")
    args = parser.parse_args()
    if not args.project.is_file():
        parser.error("Project file does not exist")
    output_dir = args.output or args.project.parent / "origin_export"
    output_dir.mkdir(parents=True, exist_ok=True)
    import win32com.client
    import originpro as op

    app = win32com.client.Dispatch('Origin.ApplicationSI')
    op.attach()
    ok = op.open(str(args.project), readonly=True, asksave=False)
    if not ok:
        print('打开项目失败:', args.project)
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
            if export_sheet(wks, f'{bn}_Sheet{j}', output_dir):
                got = True
        # 兜底：若没有任何 SheetN（如表名为自定义，如 "O2 LSV"），取当前表
        if not got:
            bk.activate()
            wks = op.find_sheet('w')
            if wks is not None:
                export_sheet(wks, f'{bn}_active', output_dir)
        i += 1
    print('导出完成，目录：', output_dir)


if __name__ == '__main__':
    main()
