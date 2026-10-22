package farm.sim;

import java.util.*;

/** Deterministic planar geometry. Units are metres in the map's local ENU frame. */
public final class Geometry {
    private Geometry() {}
    public static final double EPS = 1e-7;
    public static final class Point {
        public final double x, y;
        public Point(double x, double y) { this.x=x; this.y=y; }
        public List<Double> json() { return Arrays.asList(x,y); }
        public String toString() { return "("+x+","+y+")"; }
    }
    public static Point point(Object value) {
        List<?> a=(List<?>)value;
        return new Point(((Number)a.get(0)).doubleValue(),((Number)a.get(1)).doubleValue());
    }
    public static List<Point> points(Object value) {
        List<Point> out=new ArrayList<Point>();
        if(value instanceof List) for(Object p:(List<?>)value) out.add(point(p));
        if(out.size()>1 && distance(out.get(0),out.get(out.size()-1))<EPS) out.remove(out.size()-1);
        return out;
    }
    public static List<Object> json(List<Point> points) {
        List<Object> out=new ArrayList<Object>(); for(Point p:points) out.add(p.json()); return out;
    }
    public static double distance(Point a,Point b) { return Math.hypot(a.x-b.x,a.y-b.y); }
    public static double length(List<Point> line) { double r=0;for(int i=1;i<line.size();i++)r+=distance(line.get(i-1),line.get(i));return r; }
    public static double area(List<Point> poly) { double s=0;for(int i=0;i<poly.size();i++){Point a=poly.get(i),b=poly.get((i+1)%poly.size());s+=a.x*b.y-b.x*a.y;}return Math.abs(s)*0.5; }
    public static Point lerp(Point a,Point b,double t) { return new Point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t); }
    public static boolean onSegment(Point p,Point a,Point b) {
        double d=distance(a,b); if(d<EPS)return distance(p,a)<EPS;
        double cross=(p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x);
        if(Math.abs(cross)>EPS*Math.max(1,d))return false;
        return (p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)<=EPS;
    }
    public static boolean inside(Point p,List<Point> poly) {
        boolean in=false;
        for(int i=0,j=poly.size()-1;i<poly.size();j=i++){
            Point a=poly.get(i),b=poly.get(j); if(onSegment(p,a,b))return true;
            if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)in=!in;
        }
        return in;
    }
    private static double cross(double ax,double ay,double bx,double by){return ax*by-ay*bx;}
    /** All polygon-edge intersection parameters, so even narrow exterior gaps are checked. */
    private static void intersections(Point a,Point b,List<Point> poly,List<Double> ts){
        double rx=b.x-a.x,ry=b.y-a.y;
        for(int i=0;i<poly.size();i++){
            Point c=poly.get(i),d=poly.get((i+1)%poly.size());double sx=d.x-c.x,sy=d.y-c.y;
            double den=cross(rx,ry,sx,sy);
            if(Math.abs(den)>EPS){double t=cross(c.x-a.x,c.y-a.y,sx,sy)/den;double u=cross(c.x-a.x,c.y-a.y,rx,ry)/den;
                if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS)ts.add(Math.max(0,Math.min(1,t)));
            }else if(Math.abs(cross(c.x-a.x,c.y-a.y,rx,ry))<EPS){
                double rr=rx*rx+ry*ry;if(rr>EPS){double t=((c.x-a.x)*rx+(c.y-a.y)*ry)/rr;double u=((d.x-a.x)*rx+(d.y-a.y)*ry)/rr;
                    if(t>=0&&t<=1)ts.add(t);if(u>=0&&u<=1)ts.add(u);}
            }
        }
    }
    public static boolean segmentInside(Point a,Point b,List<Point> poly){return segmentInsideUnion(a,b,Arrays.asList(poly));}
    public static boolean segmentInsideUnion(Point a,Point b,List<List<Point>> regions){
        if(!insideUnion(a,regions)||!insideUnion(b,regions))return false;
        List<Double> ts=new ArrayList<Double>();ts.add(0.0);ts.add(1.0);
        for(List<Point> p:regions)intersections(a,b,p,ts);Collections.sort(ts);
        for(int i=1;i<ts.size();i++)if(!insideUnion(lerp(a,b,(ts.get(i)+ts.get(i-1))/2),regions))return false;
        return true;
    }
    public static boolean insideUnion(Point p,List<List<Point>> regions){for(List<Point> r:regions)if(inside(p,r))return true;return false;}
    public static boolean convex(List<Point> poly){
        double sign=0;for(int i=0;i<poly.size();i++){Point a=poly.get(i),b=poly.get((i+1)%poly.size()),c=poly.get((i+2)%poly.size());double v=cross(b.x-a.x,b.y-a.y,c.x-b.x,c.y-b.y);if(Math.abs(v)<EPS)continue;if(sign*v<0)return false;sign=v;}return sign!=0;
    }
    public static void validateSimplePolygon(List<Point> p){
        if(p.size()<3||area(p)<1e-5)throw new IllegalArgumentException("Field polygon must have nonzero area and at least three vertices");
        for(int i=0;i<p.size();i++)for(int j=i+1;j<p.size();j++){
            if(j==i+1||(i==0&&j==p.size()-1))continue;
            Point a=p.get(i),b=p.get((i+1)%p.size()),c=p.get(j),d=p.get((j+1)%p.size());
            if(segmentsIntersect(a,b,c,d))throw new IllegalArgumentException("Self-intersecting field polygon");
        }
    }
    private static boolean segmentsIntersect(Point a,Point b,Point c,Point d){
        double v1=cross(b.x-a.x,b.y-a.y,c.x-a.x,c.y-a.y),v2=cross(b.x-a.x,b.y-a.y,d.x-a.x,d.y-a.y);
        double v3=cross(d.x-c.x,d.y-c.y,a.x-c.x,a.y-c.y),v4=cross(d.x-c.x,d.y-c.y,b.x-c.x,b.y-c.y);
        return (v1*v2<0&&v3*v4<0)||onSegment(a,c,d)||onSegment(b,c,d)||onSegment(c,a,b)||onSegment(d,a,b);
    }
    /** Visibility graph path entirely in a simple polygon (no vehicle turning radius model). */
    public static List<Point> pathInside(Point from,Point to,List<Point> poly){
        if(!inside(from,poly)||!inside(to,poly))throw new IllegalArgumentException("Path endpoint outside field: "+from+" -> "+to);
        if(segmentInside(from,to,poly))return new ArrayList<Point>(Arrays.asList(from,to));
        List<Point> nodes=new ArrayList<Point>();nodes.add(from);nodes.add(to);nodes.addAll(poly);
        int n=nodes.size();double[][] weights=new double[n][n];
        for(int i=0;i<n;i++)for(int j=0;j<n;j++)weights[i][j]=(i==j?0:Double.POSITIVE_INFINITY);
        for(int i=0;i<n;i++)for(int j=i+1;j<n;j++)if(segmentInside(nodes.get(i),nodes.get(j),poly))weights[i][j]=weights[j][i]=distance(nodes.get(i),nodes.get(j));
        return shortest(nodes,weights,0,1);
    }
    private static List<Point> shortest(List<Point> nodes,double[][] w,int start,int end){
        int n=nodes.size();double[] dist=new double[n];int[] prev=new int[n];boolean[] done=new boolean[n];Arrays.fill(dist,Double.POSITIVE_INFINITY);Arrays.fill(prev,-1);dist[start]=0;
        for(int k=0;k<n;k++){int u=-1;for(int i=0;i<n;i++)if(!done[i]&&(u<0||dist[i]<dist[u]))u=i;if(u<0||!Double.isFinite(dist[u]))break;done[u]=true;if(u==end)break;
            for(int v=0;v<n;v++)if(!done[v]&&dist[u]+w[u][v]<dist[v]){dist[v]=dist[u]+w[u][v];prev[v]=u;}}
        if(!Double.isFinite(dist[end]))throw new IllegalArgumentException("No connected valid path");
        LinkedList<Point> out=new LinkedList<Point>();for(int u=end;u!=-1;u=prev[u])out.addFirst(nodes.get(u));return new ArrayList<Point>(out);
    }
    /** Clip horizontal coverage centrelines to the polygon using an even/odd scanline. */
    public static List<List<Point>> strips(List<Point> poly,double swath){
        validateSimplePolygon(poly);if(!(swath>0))throw new IllegalArgumentException("swath must be positive");
        double lo=Double.POSITIVE_INFINITY,hi=Double.NEGATIVE_INFINITY;for(Point p:poly){lo=Math.min(lo,p.y);hi=Math.max(hi,p.y);}
        int rows=Math.max(1,(int)Math.ceil((hi-lo)/swath));List<List<Point>> lines=new ArrayList<List<Point>>();
        for(int row=0;row<rows;row++){
            double y=lo+(row+0.5)*(hi-lo)/rows;List<Double> xs=new ArrayList<Double>();
            for(int i=0;i<poly.size();i++){Point a=poly.get(i),b=poly.get((i+1)%poly.size());if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))xs.add(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));}
            Collections.sort(xs);for(int i=0;i+1<xs.size();i+=2){Point a=new Point(xs.get(i),y),b=new Point(xs.get(i+1),y);if(distance(a,b)>EPS){List<Point> strip=new ArrayList<Point>(Arrays.asList(a,b));if(row%2==1)Collections.reverse(strip);lines.add(strip);}}
        }return lines;
    }
    /** Route only along declared connected road polylines; no off-road shortcut. */
    public static List<Point> roadPath(Point from,Point to,List<List<Point>> roads){
        if(distance(from,to)<EPS)return new ArrayList<Point>(Arrays.asList(from,to));
        List<Point> nodes=new ArrayList<Point>();nodes.add(from);nodes.add(to);
        for(List<Point> road:roads)for(Point p:road){boolean exists=false;for(Point q:nodes)if(distance(p,q)<EPS){exists=true;break;}if(!exists)nodes.add(p);}
        int n=nodes.size();double[][] w=new double[n][n];for(int i=0;i<n;i++)for(int j=0;j<n;j++)w[i][j]=i==j?0:Double.POSITIVE_INFINITY;
        for(List<Point> road:roads)for(int k=1;k<road.size();k++){Point a=road.get(k-1),b=road.get(k);for(int i=0;i<n;i++)if(onSegment(nodes.get(i),a,b))for(int j=i+1;j<n;j++)if(onSegment(nodes.get(j),a,b))w[i][j]=w[j][i]=distance(nodes.get(i),nodes.get(j));}
        return shortest(nodes,w,0,1);
    }
}
