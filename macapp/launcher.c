#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  char executable[PATH_MAX];
  char macos_dir[PATH_MAX];
  char launcher[PATH_MAX];

  if (!realpath(argv[0], executable)) return 1;
  strncpy(macos_dir, executable, sizeof(macos_dir) - 1);
  macos_dir[sizeof(macos_dir) - 1] = '\0';
  snprintf(launcher, sizeof(launcher), "%s/../Resources/launcher.sh", dirname(macos_dir));
  execl("/bin/bash", "bash", launcher, (char *)NULL);
  perror("팔자명가 자동화 실행 실패");
  return 1;
}
