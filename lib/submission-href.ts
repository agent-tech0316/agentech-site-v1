export const submissionAssetId = (id: string) =>
  /^master-body-(?:v2-)?([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.exec(id)?.[1];
export function submissionHref(id: string) {
  const asset = submissionAssetId(id);
  return "/account/submissions?" + new URLSearchParams(asset ? {asset} : {code:id});
}
