import { CaptureWorkspace } from "@/components/features/capture-workspace";
import { Page, PageHeader } from "@/components/ui/page";

export default async function EditGuidedRecordPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return (
    <Page>
      <PageHeader
        title="Edit guided record"
        description="Correct this draft, review its accounting effect again, then explicitly confirm it when ready."
      />
      <CaptureWorkspace initialDraftId={draftId} />
    </Page>
  );
}
