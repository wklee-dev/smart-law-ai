import unittest
from pathlib import Path

from site_parser import SiteParseError, parse_detail, parse_list


BASE = "https://www.kctdi.or.kr/kctdi/research/research11.do"
DETAIL_URL = BASE + "?mode=view&articleNo=5996&article.offset=10&articleLimit=100"

# Structure and the two attachment links/names are from the live article 5996,
# accessed 2026-11-16; content body is intentionally shortened for this test.
ATTACHED_DETAIL = '''
<div class="view-cont">
 <input name="articleNo" type="hidden" value="5996"/>
 <div class="view-question">
  <ul class="view-tit--box"><p class="view-tit">제목</p></ul>
  <div class="view-download--box">
   <a class="b-file-dwn xlsx" href="?mode=download&amp;articleNo=5996&amp;attachNo=7475" title="첨부파일다운로드">
    260916 [붙임1] 미 관세 부과 대상 폴리실리콘 잉곳 및 폴리실리콘 파생제품 한-미 품목번호 연계표.xlsx(다운로드)
   </a>
   <a class="b-file-dwn xlsx" href="?mode=download&amp;articleNo=5996&amp;attachNo=7476" title="첨부파일다운로드">
    260916 [붙임2] 미 관세 부과 대상 무인항공시스템 및 부품 한-미 품목번호 연계표.xlsx(다운로드)
   </a>
  </div>
  <div class="view-txt"><div class="fr-view"><p>본문 <b>강조</b> 이어짐<br/>둘째 줄</p>
    <p>광고 <a href="https://www.kctdi.or.kr/_res/_common/js/pdf/web/viewer.html?file=%2Fkctdi%2Fresearch%2Fresearch03.do%3Fmode%3Dopen-download%26articleNo%3D6111%26attachNo%3D7546">다른 게시판 PDF</a></p>
    <p><a href="https://outside.example/advertisement.pdf">외부 광고</a></p>
  </div></div>
 </div>
 <div class="view-list"><a href="?mode=download&amp;articleNo=123&amp;attachNo=888">다른 글</a></div>
</div>
<a href="https://outside.example/file.pdf">페이지 바깥 광고</a>
'''

# The empty marker is copied from a real search-with-no-results response.
EMPTY_LIST = '''
<div class="flex-table__wrap flex-table-list mt_16">
 <div class="thead"><div class="tr">
  <div class="th num">번호</div><div class="th subject">제목</div>
  <div class="th writer">글쓴이</div><div class="th date">등록일</div>
  <div class="th file">첨부파일</div>
 </div></div>
 <div class="tbody"><div class="tr"><div class="td no-list">등록된 글이 없습니다.</div></div></div>
</div>
'''

ROW = '''<div class="tr">
 <div class="td num">4541</div>
 <div class="td subject"><a href="?mode=view&amp;articleNo=6129&amp;article.offset=0&amp;articleLimit=10">CPTPP 주요 내용, 8차례 세미나서 설명한다</a><i class="icon-new">신규</i></div>
 <div class="td writer">지식사업실</div><div class="td date">2026.11.13</div>
 <div class="td file"></div>
</div>'''
EMPTY_ROW = '<div class="tr"><div class="td no-list">등록된 글이 없습니다.</div></div>'
LIST = EMPTY_LIST.replace(EMPTY_ROW, ROW)


# Observed on article 5167; the session ID is a harmless synthetic value.
PREVIEW_HREF = ("javascript:window.open('/_res/_common/js/pdf/web/viewer.html?file=' + "
                "encodeURIComponent('/kctdi/research/research11.do;jsessionid="
                "ABC123.node1?mode=open-download&articleNo=5167&attachNo=7045'))")
PREVIEW_DETAIL = '''
<div class="view-cont">
 <input name="articleNo" type="hidden" value="5167"/>
 <div class="view-question">
  <ul class="view-tit--box"><p class="view-tit">제목</p></ul>
  <div class="view-download--box">
   <a class="b-file-dwn pdf" href="''' + PREVIEW_HREF + '''" title="첨부파일미리보기">
    2026년 간이정액환급률표 별지.pdf(미리보기)
   </a>
  </div>
  <div class="view-txt"><div class="fr-view"><p>2026년 환급률표</p></div></div>
 </div>
</div>
'''

DIRECT_PARAGRAPH_DETAIL = '''
<div class="view-cont">
 <input name="articleNo" value="2251"/>
 <div class="view-question">
  <ul class="view-tit--box"><p>제목</p></ul>
  <div class="view-download--box">
   <a class="b-file-dwn jpg" href="?mode=download&amp;articleNo=2251&amp;attachNo=4414">131210-1.jpg(다운로드)</a>
  </div>
  <div class="view-txt"><!--StartFragment--><p>첫 <b>본문</b><br/>둘째 줄</p>
   <p>본문 링크 <a class="b-file-dwn pdf" href="?mode=download&amp;articleNo=2251&amp;attachNo=9999">광고.pdf(다운로드)</a></p></div>
 </div>
 <div class="view-list"><a href="?mode=download&amp;articleNo=2251&amp;attachNo=8888">이전 글</a></div>
</div>
<a href="?mode=download&amp;articleNo=2251&amp;attachNo=7777">바깥 링크</a>
'''


class ParseListTests(unittest.TestCase):
    def test_list_fields_and_absolute_url(self):
        result = parse_list(LIST, 3, BASE + "?mode=list&article.offset=20")
        self.assertEqual(result, [{
            "article_no": "6129", "board_number": "4541",
            "title": "CPTPP 주요 내용, 8차례 세미나서 설명한다",
            "writer": "지식사업실", "registered_date": "2026-11-13",
            "detail_url": BASE + "?mode=view&articleNo=6129&article.offset=0&articleLimit=10",
            "list_page": 3,
        }])

    def test_empty_writer_allowed_but_cell_remains_required_and_unique(self):
        for value in ("", " \n \t"):
            html = LIST.replace("지식사업실</div>", value + "</div>")
            with self.subTest(writer=value):
                self.assertEqual(parse_list(html, 1, BASE)[0]["writer"], "")
        for html in (LIST.replace('class="td writer"', 'class="unknown"'),
                     LIST.replace('<div class="td writer">지식사업실</div>',
                                  '<div class="td writer"></div><div class="td writer"></div>')):
            with self.subTest(html=html), self.assertRaises(SiteParseError):
                parse_list(html, 1, BASE)

    def test_actual_empty_search_result_marker(self):
        self.assertEqual(parse_list(EMPTY_LIST, 1, BASE), [])

    def test_non_board_and_missing_or_empty_body_are_errors(self):
        for html in ("", "<html><body>로그인하세요</body></html>",
                     EMPTY_LIST.replace(EMPTY_ROW, ""),
                     EMPTY_LIST.replace('class="flex-table__wrap flex-table-list mt_16"', 'class="other"')):
            with self.subTest(html=html[:80]), self.assertRaises(SiteParseError):
                parse_list(html, 1, BASE)

    def test_missing_malformed_date_and_ambiguous_rows_raise(self):
        invalid = [LIST.replace('class="td date"', 'class="unknown"'),
                   LIST.replace('2026.11.13', '2026.02.30'),
                   LIST.replace('2026.11.13', '2026.11-13'),
                   LIST.replace('articleNo=6129', 'missing=6129'),
                   LIST.replace('articleNo=6129', 'articleNo=6129&amp;articleNo=6130'),
                   LIST.replace(ROW, ROW + EMPTY_ROW),
                   EMPTY_LIST.replace('</div></div></div>\n</div>',
                                      '</div><div class="td num">1</div></div></div>\n</div>'),
                   EMPTY_LIST.replace('등록된 글이 없습니다.', '알 수 없는 상태입니다.')]
        for html in invalid:
            with self.subTest(html=html[:200]), self.assertRaises(SiteParseError):
                parse_list(html, 1, BASE)

    def test_rejects_external_article_url(self):
        html = LIST.replace('?mode=view&amp;articleNo=6129',
                            'https://outside.example/?mode=view&amp;articleNo=6129')
        with self.assertRaises(SiteParseError):
            parse_list(html, 1, BASE)

    def test_real_saved_list(self):
        path = Path(__file__).resolve().parent / 'fixtures' / 'list.html'
        if not path.exists():
            self.skipTest('provided real list HTML not available')
        result = parse_list(path.read_text(encoding='utf-8'), 1, BASE + '?mode=list&article.offset=0')
        self.assertEqual(len(result), 10)
        self.assertEqual(result[0]['article_no'], '6129')
        self.assertEqual(result[0]['registered_date'], '2026-11-13')
        self.assertEqual(result[0]['writer'], '지식사업실')
        self.assertEqual(result[0]['board_number'], '4541')


class ParseDetailTests(unittest.TestCase):
    def test_direct_paragraph_body_does_not_misidentify_links(self):
        result = parse_detail(DIRECT_PARAGRAPH_DETAIL, BASE + "?mode=view&articleNo=2251")
        self.assertIn("첫 본문\n둘째 줄", result["content_text"])
        self.assertIn("본문 링크 광고.pdf(다운로드)", result["content_text"])
        self.assertNotIn("StartFragment", result["content_text"])
        self.assertIn("<!--StartFragment-->", result["content_html"])
        self.assertIn("<b>본문</b>", result["content_html"])
        self.assertIn("attachNo=9999", result["content_html"])
        self.assertNotIn("view-download--box", result["content_html"])
        self.assertEqual(result["attachments"], [{
            "file_key": "4414", "original_filename": "131210-1.jpg",
            "url": BASE + "?mode=download&articleNo=2251&attachNo=4414",
        }])

    def test_direct_body_rejects_unrecognized_or_mixed_wrappers(self):
        direct = DIRECT_PARAGRAPH_DETAIL
        wrapped = ATTACHED_DETAIL
        invalid = [(direct.replace('<p>첫 <b>본문</b><br/>둘째 줄</p>', '<div>본문</div>'), "2251"),
                   (direct.replace('<div class="view-txt">', '<div class="view-txt"><div>미확인</div>'), "2251"),
                   (wrapped.replace('<div class="fr-view">', '<div class="fr-view"></div><div class="fr-view">'), "5996"),
                   (wrapped.replace('<div class="fr-view">', '<p>추가</p><div class="fr-view">'), "5996"),
                   (wrapped.replace('<div class="fr-view">', '확인되지 않은 텍스트<div class="fr-view">'), "5996")]
        for html, article in invalid:
            with self.subTest(html=html[:200]), self.assertRaises(SiteParseError):
                parse_detail(html, BASE + "?mode=view&articleNo=" + article)

    def test_pdf_preview_with_and_without_session_is_canonical_https(self):
        expected = [{"file_key": "7045", "original_filename": "2026년 간이정액환급률표 별지.pdf",
                     "url": BASE + "?mode=open-download&articleNo=5167&attachNo=7045"}]
        for html, url in [
                (PREVIEW_DETAIL, BASE + "?mode=view&articleNo=5167"),
                (PREVIEW_DETAIL.replace(";jsessionid=ABC123.node1", ""),
                 BASE + "?mode=view&articleNo=5167"),
                (PREVIEW_DETAIL, BASE.replace("https://", "http://") + "?mode=view&articleNo=5167")]:
            with self.subTest(url=url, has_session="jsessionid" in html):
                result = parse_detail(html, url)
                self.assertEqual(result["attachments"], expected)
                self.assertNotIn("jsessionid", result["attachments"][0]["url"])

    def test_mixed_regular_and_pdf_attachments_for_4521(self):
        pdf = PREVIEW_DETAIL.replace("5167", "4521").replace("7045", "6762")
        pdf = pdf.replace(";jsessionid=ABC123.node1", "")
        pdf = pdf.replace('  <div class="view-download--box">',
                          '  <div class="view-download--box">\n'
                          '   <a class="b-file-dwn xlsx" href="?mode=download&amp;articleNo=4521&amp;attachNo=6761">표.xlsx(다운로드)</a>')
        pdf = pdf.replace('</a>\n  </div>', '</a>\n' +
                          '   <a class="b-file-dwn pdf" href="' +
                          PREVIEW_HREF.replace("5167", "4521").replace("7045", "6763").replace(";jsessionid=ABC123.node1", "") +
                          '">법령.pdf(미리보기)</a>\n  </div>')
        result = parse_detail(pdf, BASE + "?mode=view&articleNo=4521")
        self.assertEqual([a["file_key"] for a in result["attachments"]], ["6761", "6762", "6763"])
        self.assertEqual([a["url"] for a in result["attachments"]], [
            BASE + "?mode=download&articleNo=4521&attachNo=6761",
            BASE + "?mode=open-download&articleNo=4521&attachNo=6762",
            BASE + "?mode=open-download&articleNo=4521&attachNo=6763"])
        self.assertEqual(result["attachments"][2]["original_filename"], "법령.pdf")

    def test_pdf_preview_rejects_untrusted_javascript_and_target(self):
        hrefs = [
            PREVIEW_HREF + ";alert(1)",
            PREVIEW_HREF.replace("window.open", "alert"),
            PREVIEW_HREF.replace("encodeURIComponent(", "evil("),
            PREVIEW_HREF.replace("viewer.html?file=", "other.html?file="),
            PREVIEW_HREF.replace("/_res/_common/js/pdf/web/viewer.html", "https://evil.example/viewer.html"),
            PREVIEW_HREF.replace("/kctdi/research/research11.do", "https://evil.example/kctdi/research/research11.do"),
            PREVIEW_HREF.replace("research11.do", "research03.do"),
            PREVIEW_HREF.replace("research11.do", "../research11.do"),
            PREVIEW_HREF.replace(";jsessionid=ABC123.node1", ";other=ABC123"),
            PREVIEW_HREF.replace(";jsessionid=ABC123.node1", ";jsessionid="),
            PREVIEW_HREF.replace(";jsessionid=ABC123.node1", ";jsessionid=abc%2fdef"),
            PREVIEW_HREF.replace("mode=open-download", "mode=download"),
            PREVIEW_HREF.replace("articleNo=5167", "articleNo=4521"),
            PREVIEW_HREF.replace("articleNo=5167", "articleNo=abc"),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo=abc"),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo="),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo=7045&attachNo=7046"),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo=7045&other=1"),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo=7045#fragment"),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo=7045%27%29%3Balert%281%29"),
            PREVIEW_HREF.replace("attachNo=7045", "attachNo=7045')) + alert('x"),
        ]
        for href in hrefs:
            html = PREVIEW_DETAIL.replace(PREVIEW_HREF, href)
            with self.subTest(href=href), self.assertRaises(SiteParseError):
                parse_detail(html, BASE + "?mode=view&articleNo=5167")
        for html, url in [
                (PREVIEW_DETAIL.replace("b-file-dwn pdf", "b-file-dwn xlsx"), BASE + "?mode=view&articleNo=5167"),
                (PREVIEW_DETAIL.replace("(미리보기)", "(다운로드)"), BASE + "?mode=view&articleNo=5167"),
                (PREVIEW_DETAIL.replace("2026년 간이정액환급률표 별지.pdf", ""), BASE + "?mode=view&articleNo=5167"),
                (PREVIEW_DETAIL, "https://evil.example/kctdi/research/research11.do?mode=view&articleNo=5167"),
                (PREVIEW_DETAIL, BASE.replace("research11.do", "research03.do") + "?mode=view&articleNo=5167")]:
            with self.subTest(url=url, html=html[:180]), self.assertRaises(SiteParseError):
                parse_detail(html, url)

    def test_pdf_and_regular_attachment_cannot_share_identifier(self):
        html = PREVIEW_DETAIL.replace('  <div class="view-download--box">',
               '  <div class="view-download--box">'
               '<a class="b-file-dwn xlsx" href="?mode=download&amp;articleNo=5167&amp;attachNo=7045">표.xlsx(다운로드)</a>')
        with self.assertRaises(SiteParseError):
            parse_detail(html, BASE + "?mode=view&articleNo=5167")

    def test_observed_two_attachments_and_body(self):
        result = parse_detail(ATTACHED_DETAIL, DETAIL_URL)
        self.assertEqual(set(result), {'content_text', 'content_html', 'attachments'})
        self.assertEqual(result['attachments'], [
            {'file_key': '7475',
             'original_filename': '260916 [붙임1] 미 관세 부과 대상 폴리실리콘 잉곳 및 폴리실리콘 파생제품 한-미 품목번호 연계표.xlsx',
             'url': BASE + '?mode=download&articleNo=5996&attachNo=7475'},
            {'file_key': '7476',
             'original_filename': '260916 [붙임2] 미 관세 부과 대상 무인항공시스템 및 부품 한-미 품목번호 연계표.xlsx',
             'url': BASE + '?mode=download&articleNo=5996&attachNo=7476'},
        ])
        self.assertIn('본문 강조 이어짐\n둘째 줄', result['content_text'])
        self.assertIn('다른 게시판 PDF', result['content_text'])
        self.assertIn('<b>강조</b>', result['content_html'])
        self.assertNotIn('view-download--box', result['content_html'])

    def test_body_pdf_and_external_ads_are_not_attachments(self):
        start = ATTACHED_DETAIL.index('  <div class="view-download--box">')
        end = ATTACHED_DETAIL.index('  <div class="view-txt">', start)
        html = ATTACHED_DETAIL[:start] + ATTACHED_DETAIL[end:]
        self.assertEqual(parse_detail(html, DETAIL_URL)['attachments'], [])

    def test_unrecognized_attachment_structure_raises(self):
        invalid = [
            ATTACHED_DETAIL.replace('view-download--box', 'view-attachment-new'),
            ATTACHED_DETAIL.replace('b-file-dwn xlsx', 'new-file-control xlsx', 1),
            ATTACHED_DETAIL.replace('attachNo=7475', 'newFileId=7475'),
            ATTACHED_DETAIL.replace('mode=download&amp;articleNo=5996&amp;attachNo=7475',
                                    'mode=open-download&amp;articleNo=5996&amp;attachNo=7475'),
            ATTACHED_DETAIL.replace('xlsx(다운로드)', 'xlsx', 1),
            ATTACHED_DETAIL.replace('attachNo=7476', 'attachNo=7475'),
            ATTACHED_DETAIL.replace('articleNo=5996&amp;attachNo=7475',
                                    'articleNo=6111&amp;attachNo=7475'),
            ATTACHED_DETAIL.replace('<div class="view-download--box">',
                                    '<div class="view-download--box">새로운 미확인 항목'),
        ]
        for html in invalid:
            with self.subTest(html=html[:150]), self.assertRaises(SiteParseError):
                parse_detail(html, DETAIL_URL)

    def test_unrelated_external_attachment_link_is_not_accepted(self):
        html = ATTACHED_DETAIL.replace('?mode=download&amp;articleNo=5996&amp;attachNo=7475',
                    'https://outside.example/?mode=download&amp;articleNo=5996&amp;attachNo=7475')
        with self.assertRaises(SiteParseError):
            parse_detail(html, DETAIL_URL)

    def test_unknown_attachment_section_at_view_level_raises(self):
        html = ATTACHED_DETAIL.replace('<div class="view-list">',
                  '<div class="new-attachment-area"><a href="?foo=1">파일</a></div><div class="view-list">')
        with self.assertRaises(SiteParseError):
            parse_detail(html, DETAIL_URL)

    def test_wrong_detail_bad_identity_and_missing_content_raise(self):
        for html, url in [('<html>login</html>', DETAIL_URL),
                          (ATTACHED_DETAIL.replace('class="fr-view"', 'class="unknown"'), DETAIL_URL),
                          (ATTACHED_DETAIL, DETAIL_URL.replace('articleNo=5996', 'articleNo=5997')),
                          (ATTACHED_DETAIL.replace('<input name="articleNo" type="hidden" value="5996"/>', ''), BASE),
                          (ATTACHED_DETAIL, '/relative-page')]:
            with self.subTest(url=url), self.assertRaises(SiteParseError):
                parse_detail(html, url)

    def test_real_saved_detail_ignores_pdf_ad_from_other_board(self):
        path = Path(__file__).resolve().parent / 'fixtures' / 'detail.html'
        if not path.exists():
            self.skipTest('provided real detail HTML not available')
        url = BASE + '?mode=view&articleNo=6129'
        result = parse_detail(path.read_text(encoding='utf-8'), url)
        self.assertEqual(result['attachments'], [])
        self.assertIn('CPTPP 주요 내용', result['content_text'])
        self.assertIn('research03.do', result['content_html'])
        self.assertIn('attachNo%3D7546', result['content_html'])


if __name__ == '__main__':
    unittest.main()
