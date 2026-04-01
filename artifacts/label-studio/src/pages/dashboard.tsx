import { useGetDashboardStats, useGetRecentPrintJobs, useGetProductsByType, getGetDashboardStatsQueryKey, getGetRecentPrintJobsQueryKey, getGetProductsByTypeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Package, Printer, FileText, Droplets, Flame, Wind, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: isStatsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });
  const { data: recentJobs, isLoading: isJobsLoading } = useGetRecentPrintJobs({ query: { queryKey: getGetRecentPrintJobsQueryKey() } });
  const { data: productsByType, isLoading: isTypesLoading } = useGetProductsByType({ query: { queryKey: getGetProductsByTypeQueryKey() } });

  const getProductTypeIcon = (type: string) => {
    switch (type) {
      case "soy_candle": return <Flame className="w-4 h-4" />;
      case "room_spray": return <Droplets className="w-4 h-4" />;
      case "room_diffuser": return <Wind className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const formatProductType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "ready": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "printed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening in your print shop today.</p>
      </div>

      {isStatsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/4 mt-2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeProducts} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Print Jobs</CardTitle>
              <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPrintJobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                This month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Labels Printed</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.labelsThisMonth}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {stats.sheetsThisMonth} sheets this month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Label Templates</CardTitle>
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLabelTemplates}</div>
              <p className="text-xs text-muted-foreground mt-1">
                On {stats.totalLabelSheets} sheets
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Print Jobs</CardTitle>
                <CardDescription>Your latest printing activity.</CardDescription>
              </div>
              <Link href="/print-jobs" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {isJobsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse"></div>)}
                </div>
              ) : recentJobs && recentJobs.length > 0 ? (
                <div className="space-y-4">
                  {recentJobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Printer className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">{job.name}</div>
                          <div className="text-sm text-muted-foreground">{job.labelSheetName} ({job.totalLabels} labels)</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-medium">{format(new Date(job.createdAt), "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(job.createdAt), "h:mm a")}</div>
                        </div>
                        <Badge variant="secondary" className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
                  <FileText className="w-10 h-10 mb-3 opacity-20" />
                  <p>No print jobs found.</p>
                  <Link href="/print-jobs" className="text-primary hover:underline mt-2 text-sm">Create your first print job</Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Products by Type</CardTitle>
              <CardDescription>Inventory breakdown.</CardDescription>
            </CardHeader>
            <CardContent>
              {isTypesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse"></div>)}
                </div>
              ) : productsByType && productsByType.length > 0 ? (
                <div className="space-y-4">
                  {productsByType.map((pt, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-muted-foreground">
                          {getProductTypeIcon(pt.productType)}
                        </div>
                        <span className="font-medium text-sm">{formatProductType(pt.productType)}</span>
                      </div>
                      <div className="font-mono text-sm font-medium">
                        {pt.count}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No products found.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
