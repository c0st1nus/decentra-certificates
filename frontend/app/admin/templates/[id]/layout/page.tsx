import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TemplateLayoutPage({ params }: Props) {
  const { id } = await params;

  redirect(`/admin/templates/${id}`);
}
