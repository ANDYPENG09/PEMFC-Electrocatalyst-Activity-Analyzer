"""Embed maintained workbench sources into the standalone offline index.html."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent


def build(check=False):
    path=ROOT/"index.html"
    old=path.read_text(encoding="utf-8")
    html=(ROOT/"web/workbench.html").read_text(encoding="utf-8").strip()
    core="<!-- ANALYSIS CORE START -->\n<script>\n"+(ROOT/"web/analysis.js").read_text(encoding="utf-8")+"\n</script>\n<!-- ANALYSIS CORE END -->"
    lang="<!-- I18N SCRIPT START -->\n<script>\n"+(ROOT/"web/i18n.js").read_text(encoding="utf-8")+"\n</script>\n<!-- I18N SCRIPT END -->"
    ui="<!-- WORKBENCH SCRIPT START -->\n<script>\n"+(ROOT/"web/workbench.js").read_text(encoding="utf-8")+"\n</script>\n<!-- WORKBENCH SCRIPT END -->"
    new=old
    for start,end,content,anchor in [("WORKBENCH START","WORKBENCH END",html,"<footer>"),
                                     ("ANALYSIS CORE START","ANALYSIS CORE END",core,"<script>"),
                                     ("I18N SCRIPT START","I18N SCRIPT END",lang,"</body>"),
                                     ("WORKBENCH SCRIPT START","WORKBENCH SCRIPT END",ui,"</body>")]:
        pattern=rf"<!-- {start} -->.*?<!-- {end} -->"
        if re.search(pattern,new,flags=re.S):
            new=re.sub(pattern,lambda m:content,new,flags=re.S)
        else:
            new=new.replace(anchor,content+"\n"+anchor,1)
    if check:
        if new!=old: raise SystemExit("index.html is stale; run python build_html.py")
    else:
        path.write_text(new,encoding="utf-8")


if __name__=="__main__":
    import sys
    build("--check" in sys.argv)
