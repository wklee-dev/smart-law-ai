#!/usr/bin/env python3
"""run.bat용 페이지 선택 입력. 빈 입력은 전체 범위입니다."""
import json
from pathlib import Path
import sys


def main():
    import crawler
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    config_path = Path(__file__).resolve().parent / 'config.json'
    try:
        config = json.loads(config_path.read_text(encoding='utf-8-sig')) if config_path.is_file() else {}
        size = int(config.get('page_size', 100))
        print(f'페이지당 건수: {size} (config.json의 page_size)', flush=True)
        print('페이지 번호는 작성일 내림차순 목록 기준입니다.', flush=True)
        print('입력 예: 1 / 2-4 / 1,3,5-7', flush=True)
        print('아무것도 입력하지 않고 Enter를 누르면 전체 범위를 수집합니다.', flush=True)
        pages = input('수집 페이지: ').strip()
        selected = crawler.parse_pages(pages)
        print(f'선택 범위: {selected if selected is not None else "전체"}', flush=True)
        return crawler.main(['--pages', pages])
    except (KeyboardInterrupt, EOFError):
        print('\n페이지 선택을 취소했습니다. 수집하지 않습니다.', flush=True)
        return 130
    except (ValueError, OSError) as exc:
        print(f'ERROR: {exc}', flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
