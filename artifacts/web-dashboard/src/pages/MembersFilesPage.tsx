import { useState } from 'react';
import { trpc, queryClient } from '@/lib/trpc';
import { toast } from 'sonner';
import { FolderOpen, Trash2, Users, Download } from 'lucide-react';

export function MembersFilesPage() {
  const { data: filesData, isLoading } = trpc.membersFiles.list.useQuery();
  const files = filesData?.files || [];

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const { data: fileDetail, isLoading: isLoadingDetail } = trpc.membersFiles.get.useQuery(
    { fileId: selectedFileId! },
    { enabled: !!selectedFileId }
  );

  const deleteMut = trpc.membersFiles.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف الملف');
      setSelectedFileId(null);
      queryClient.invalidateQueries({ queryKey: [['membersFiles', 'list']] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground">ملفات الأعضاء</h1>
        <p className="text-muted-foreground mt-1">إدارة قوائم الأعضاء المستخرجة والأرقام المفترة</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
              لا توجد ملفات محفوظة
            </div>
          ) : (
            files.map((file: any) => (
              <div 
                key={file.id} 
                onClick={() => setSelectedFileId(file.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${selectedFileId === file.id ? 'bg-primary/10 border-primary shadow-sm' : 'bg-card border-card-border hover:border-primary/50 hover:bg-secondary/50'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-foreground mb-1 break-all line-clamp-1" dir="ltr">{file.name || file.id}</h3>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {file.memberCount} عضو</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteMut.mutate({ id: file.id }); }}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 text-xs text-muted-foreground text-left" dir="ltr">
                  {new Date(file.createdAt).toLocaleString('ar-EG')}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="bg-card border border-card-border rounded-xl shadow-sm h-[calc(100vh-12rem)] flex flex-col overflow-hidden">
            {!selectedFileId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
                <FolderOpen className="w-16 h-16 mb-4" />
                <p>اختر ملفاً لعرض محتوياته</p>
              </div>
            ) : isLoadingDetail ? (
              <div className="flex-1 flex items-center justify-center">جاري التحميل...</div>
            ) : fileDetail ? (
              <>
                <div className="p-6 border-b border-card-border flex items-center justify-between bg-secondary/20">
                  <div>
                    <h2 className="text-xl font-bold" dir="ltr">{fileDetail.name || fileDetail.id}</h2>
                    <p className="text-sm text-muted-foreground mt-1">إجمالي: {fileDetail.members?.length || 0} عضو</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 transition-colors rounded-lg text-sm font-medium">
                    <Download className="w-4 h-4" />
                    تصدير TXT
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-secondary/50 sticky top-0 backdrop-blur-md">
                      <tr>
                        <th className="px-6 py-3 font-medium text-muted-foreground">ID / Username</th>
                        <th className="px-6 py-3 font-medium text-muted-foreground">الاسم</th>
                        <th className="px-6 py-3 font-medium text-muted-foreground">الهاتف</th>
                        <th className="px-6 py-3 font-medium text-muted-foreground text-center">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {fileDetail.members?.map((m: any, i: number) => (
                        <tr key={i} className="hover:bg-secondary/20">
                          <td className="px-6 py-3 font-mono text-xs" dir="ltr">
                            {m.username ? `@${m.username}` : m.userId}
                          </td>
                          <td className="px-6 py-3">{m.firstName} {m.lastName}</td>
                          <td className="px-6 py-3 font-mono" dir="ltr">{m.phone || '-'}</td>
                          <td className="px-6 py-3 text-center">
                            {m.isOnline && <span className="inline-block w-2 h-2 rounded-full bg-success"></span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-destructive">خطأ في تحميل الملف</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}