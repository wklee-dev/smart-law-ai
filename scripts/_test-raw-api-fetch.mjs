const res = await fetch(
  "http://localhost:3000/api/customs-law-portal/raw-rule/tree?gubun=" +
    encodeURIComponent("관세관련"),
);
const data = await res.json();
console.log("tree ok:", data.ok, "roots:", data.tree?.length);
console.log("root0:", data.tree?.[0]?.lawName, "children:", data.tree?.[0]?.children?.length);

const lawId = data.tree?.[0]?.children?.[0]?.lawId;
if (lawId) {
  const dres = await fetch(
    `http://localhost:3000/api/customs-law-portal/raw-rule/detail?lawId=${lawId}`,
  );
  const detail = await dres.json();
  console.log("detail ok:", detail.ok, detail.detail?.lawName, "articles:", detail.detail?.articles?.length);
}
