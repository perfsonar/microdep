%{!?perl_vendorlib: %define perl_vendorlib %(eval "`%{__perl} -V:installvendorlib`"; echo $installvendorlib)}

%define short Tie-RefHash-Weak

Name:           perl-%{short}
Version:        0.09
Release:        1%{?dist}
Summary:        A Tie::RefHash subclass with weakened references in the keys.
License:        GPL+ or Artistic
Group:          Development/Libraries
URL:            https://metacpan.org/pod/Tie::RefHash::Weak
Source0:        %{short}-%{version}.tar.gz 
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-root-%(%{__id_u} -n)
BuildArch:      noarch

%description
A Tie::RefHash subclass with weakened references in the keys.

%prep
%setup -q -n %{short}-%{version}

%build
%{__perl} Makefile.PL INSTALLDIRS=vendor
make


%install
make pure_install PERL_INSTALL_ROOT=%{buildroot}

find %{buildroot} -type f -name .packlist -exec rm -f {} \;
find %{buildroot} -depth -type d -exec rmdir {} 2>/dev/null \;


%files
%defattr(-,root,root,-)
%doc Changes SIGNATURE TODO
%{perl_vendorlib}/*
%{_mandir}/man3/*

%changelog
* Mon Jun 23 2025 Mark Feit <mfeit@internet2.edu> 0.09-1
- Added to repository

