import ShoppingCirclePage from '@/components/ShoppingCirclePage';

type PageProps = {
  params: {
    shareCode: string;
  };
};

export default function CirclePage({ params }: PageProps) {
  return <ShoppingCirclePage shareCode={params.shareCode} />;
}