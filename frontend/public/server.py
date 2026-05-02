from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit


class AdminFriendlyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        route_map = {
            "/admin": "/admin.html",
            "/admin/": "/admin.html",
            "/admin/login": "/admin.html",
            "/admin/programs": "/screens/admin-programs.html",
            "/admin/guests": "/admin.html",
            "/admin/books": "/screens/admin-books.html",
            "/admin/materials": "/screens/admin-materials.html",
            "/admin/users": "/screens/admin-users.html",
            "/admin/system": "/screens/admin-system.html",
        }
        if path in route_map:
            self.path = route_map[path]
        return super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8888), AdminFriendlyHandler)
    print("Serving frontend/public at http://127.0.0.1:8888")
    server.serve_forever()
